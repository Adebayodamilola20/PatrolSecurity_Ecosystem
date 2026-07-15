import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { distanceMeters } from "./lib/geo";
import { signPhotoToken, verifyPhotoToken, storageIdFromLegacyUrl, isLegacyUrlRef } from "./lib/photoRefs";

/**
 * Server-side verification of the GPS movement gate and photo-token rules.
 *
 * These run inside one transaction against the real deployment, which is the
 * only honest way to test the gate: driving it from `npx convex run` makes each
 * call a separate round trip, so network latency silently becomes elapsed time
 * and turns a "stationary skip" into a legitimate heartbeat write.
 *
 * Every row it writes is deleted before it returns.
 *
 *   npx convex run selfTest:verifyGpsGate '{}'
 */
export const verifyGpsGate = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const results: { name: string; pass: boolean; detail: string }[] = [];
    const created: string[] = [];

    // Park the test far from any real trail so it cannot interact with live data.
    const baseLat = 51.5;
    const baseLng = -0.12;

    const call = async (lat: number, lng: number, capturedAt: number) => {
      const res: any = await ctx.runMutation(internal.positions.record, {
        userId: args.userId,
        latitude: lat,
        longitude: lng,
        capturedAt,
      });
      return res;
    };

    const t0 = Date.now();

    // 1. First point always lands (it is the trail's start).
    const first = await call(baseLat, baseLng, t0);
    results.push({
      name: "first position is written",
      pass: first.status === "ok",
      detail: JSON.stringify(first),
    });

    // 2. Same spot, 30s later — a guard standing still. Must be dropped.
    const stationary = await call(baseLat + 0.000001, baseLng, t0 + 30_000);
    results.push({
      name: "stationary 30s later is skipped",
      pass: stationary.status === "skipped",
      detail: JSON.stringify(stationary),
    });

    // 3. ~25m away, 30s later — real movement. Must be kept.
    //    0.000225 deg latitude ~= 25m.
    const moved = await call(baseLat + 0.000225, baseLng, t0 + 60_000);
    results.push({
      name: "moved >=20m is written",
      pass: moved.status === "ok",
      detail: `${JSON.stringify(moved)} (${distanceMeters(baseLat, baseLng, baseLat + 0.000225, baseLng)}m)`,
    });

    // 4. Still, but 6 minutes on — heartbeat must win over the distance gate.
    const heartbeat = await call(baseLat + 0.000226, baseLng, t0 + 60_000 + 360_000);
    results.push({
      name: "stationary past 5min heartbeat is written",
      pass: heartbeat.status === "ok",
      detail: JSON.stringify(heartbeat),
    });

    // Clean up every row this test created.
    const rows = await ctx.db
      .query("officerPositions")
      .withIndex("by_userId_capturedAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
    for (const row of rows) {
      if (Math.abs(row.latitude - baseLat) < 0.01 && Math.abs(row.longitude - baseLng) < 0.01) {
        await ctx.db.delete(row._id);
        created.push(row._id);
      }
    }

    return {
      passed: results.every((r) => r.pass),
      results,
      cleanedUp: created.length,
    };
  },
});

/**
 * Retention: rows past the window go, rows inside it stay.
 *
 * Plants one ancient breadcrumb and one fresh one, runs the real cron target,
 * and asserts only the ancient one was taken.
 *
 *   npx convex run selfTest:verifyRetentionPurge '{"userId":"..."}'
 */
export const verifyRetentionPurge = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const results: { name: string; pass: boolean; detail: string }[] = [];
    const day = 24 * 60 * 60 * 1000;
    const ancient = Date.now() - 400 * day; // well past any sane retention
    const fresh = Date.now() - 1 * day;

    const oldId = await ctx.db.insert("officerPositions", {
      userId: args.userId,
      latitude: 1.234567,
      longitude: 1.234567,
      capturedAt: ancient,
    });
    const newId = await ctx.db.insert("officerPositions", {
      userId: args.userId,
      latitude: 1.234568,
      longitude: 1.234568,
      capturedAt: fresh,
    });

    const purge: any = await ctx.runMutation(
      internal.positions.purgeOldPositions,
      {},
    );

    const oldGone = (await ctx.db.get(oldId)) === null;
    const newKept = (await ctx.db.get(newId)) !== null;

    results.push({
      name: "a position past the retention window is deleted",
      pass: oldGone,
      detail: `deleted=${purge.deleted}, cutoff=${new Date(purge.cutoff).toISOString()}`,
    });
    results.push({
      name: "a position inside the window is kept",
      pass: newKept,
      detail: newKept ? "kept" : "WRONGLY DELETED",
    });

    // Leave nothing behind.
    if (newKept) await ctx.db.delete(newId);
    if (!oldGone) await ctx.db.delete(oldId);

    return { passed: results.every((r) => r.pass), results };
  },
});

/**
 * Ownership rules on an uploaded blob: a storageId that leaks to another user
 * must not be claimable or attachable by them.
 *
 *   npx convex run selfTest:verifyUploadOwnership '{"storageId":"...","ownerId":"...","otherUserId":"..."}'
 */
export const verifyUploadOwnership = internalMutation({
  args: {
    storageId: v.id("_storage"),
    ownerId: v.id("users"),
    otherUserId: v.id("users"),
    // A real, well-formed storageId that was never claimed (e.g. one whose
    // validation failed). Proves attach refuses anything with no asset row.
    unclaimedStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const results: { name: string; pass: boolean; detail: string }[] = [];

    const expectThrow = async (name: string, fn: () => Promise<unknown>, needle: string) => {
      try {
        await fn();
        results.push({ name, pass: false, detail: "no error thrown — SECURITY HOLE" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ name, pass: msg.includes(needle), detail: msg });
      }
    };

    await expectThrow(
      "another user cannot claim this upload",
      () =>
        ctx.runMutation(internal.photos.claimAsset, {
          storageId: args.storageId,
          uploadedBy: args.otherUserId,
          kind: "incident",
          contentType: "image/jpeg",
          sizeBytes: 160,
        }),
      "another user",
    );

    await expectThrow(
      "another user cannot attach this upload to their record",
      () =>
        ctx.runMutation(internal.photos.attachAsset, {
          storageId: args.storageId,
          userId: args.otherUserId,
          table: "incidents",
          recordId: "forged_record",
        }),
      "another user",
    );

    await expectThrow(
      "an unclaimed blob cannot be attached at all",
      () =>
        ctx.runMutation(internal.photos.attachAsset, {
          storageId: args.unclaimedStorageId,
          userId: args.ownerId,
          table: "incidents",
          recordId: "x",
        }),
      "not claimed",
    );

    return { passed: results.every((r) => r.pass), results };
  },
});

/**
 * Mints a photo token for an arbitrary tenant so the /photos route's
 * defence-in-depth tenant re-check can be exercised over real HTTP.
 */
export const mintPhotoTokenForTest = internalMutation({
  args: { storageId: v.string(), cid: v.optional(v.string()), uid: v.optional(v.string()), role: v.string() },
  handler: async (_ctx, args) => {
    return {
      token: await signPhotoToken({
        sid: args.storageId,
        cid: args.cid ?? null,
        uid: args.uid ?? null,
        role: args.role,
      }),
    };
  },
});

/**
 * Removes records the verification pass created in the live deployment: the
 * "ARCH TEST" incident, its photo assets, and their blobs.
 *
 *   npx convex run selfTest:cleanupTestArtifacts '{}'
 */
export const cleanupTestArtifacts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const removed: string[] = [];

    const incidents = await ctx.db.query("incidents").take(200);
    for (const incident of incidents) {
      if (!incident.title.startsWith("ARCH TEST")) continue;
      for (const ref of incident.photoUrls ?? []) {
        const asset = await ctx.db
          .query("photoAssets")
          .withIndex("by_storageId", (q) => q.eq("storageId", ref as any))
          .first();
        if (asset) {
          await ctx.storage.delete(asset.storageId);
          await ctx.db.delete(asset._id);
          removed.push(`asset ${asset.storageId}`);
        }
      }
      await ctx.db.delete(incident._id);
      removed.push(`incident ${incident._id}`);
    }

    // Any test upload that was claimed but never attached to a record.
    const unattached = await ctx.db
      .query("photoAssets")
      .withIndex("by_attachedAt", (q) => q.eq("attachedAt", undefined))
      .take(50);
    for (const asset of unattached) {
      await ctx.storage.delete(asset.storageId);
      await ctx.db.delete(asset._id);
      removed.push(`orphan asset ${asset.storageId}`);
    }

    return { removed, count: removed.length };
  },
});

/**
 * Photo capability tokens: signed, single-blob, and unforgeable.
 *
 *   npx convex run selfTest:verifyPhotoTokens '{}'
 */
export const verifyPhotoTokens = internalMutation({
  args: {},
  handler: async () => {
    const results: { name: string; pass: boolean; detail: string }[] = [];

    const token = await signPhotoToken({ sid: "storage_abc", cid: "client_1", role: "guard" });
    const ok = await verifyPhotoToken(token);
    results.push({
      name: "a freshly signed token verifies and names its blob",
      pass: ok?.sid === "storage_abc" && ok?.cid === "client_1",
      detail: JSON.stringify(ok),
    });

    // Flipping a byte in the payload must invalidate the signature.
    const tampered = token.slice(0, -3) + (token.slice(-3) === "aaa" ? "bbb" : "aaa");
    const bad = await verifyPhotoToken(tampered);
    results.push({
      name: "a tampered token is rejected",
      pass: bad === null,
      detail: String(bad),
    });

    results.push({
      name: "garbage is rejected rather than throwing",
      pass: (await verifyPhotoToken("not-a-token")) === null,
      detail: "ok",
    });

    // Legacy URL handling — the migration's parser.
    results.push({
      name: "legacy storage URL yields its storageId",
      pass:
        storageIdFromLegacyUrl(
          "https://resilient-buffalo-226.convex.cloud/api/storage/kg2abc123",
        ) === "kg2abc123",
      detail: String(
        storageIdFromLegacyUrl(
          "https://resilient-buffalo-226.convex.cloud/api/storage/kg2abc123",
        ),
      ),
    });
    results.push({
      name: "a foreign URL is left alone (returns null, never corrupts)",
      pass: storageIdFromLegacyUrl("https://example.com/cat.jpg") === null,
      detail: "ok",
    });
    results.push({
      name: "a storageId is not mistaken for a URL",
      pass: !isLegacyUrlRef("kg2abc123") && isLegacyUrlRef("https://x/api/storage/y"),
      detail: "ok",
    });

    return { passed: results.every((r) => r.pass), results };
  },
});
