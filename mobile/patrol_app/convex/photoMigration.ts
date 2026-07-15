import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { isLegacyUrlRef, storageIdFromLegacyUrl } from "./lib/photoRefs";
import type { Id } from "./_generated/dataModel";

/**
 * Converts pre-migration permanent storage URLs into storageIds, in place.
 *
 * Photo columns used to hold the output of ctx.storage.getUrl() — a URL that is
 * publicly fetchable forever by anyone holding the string. Those URLs embed the
 * storageId they point at, so the conversion is a parse rather than a re-upload:
 * no bytes move and no file is touched.
 *
 * Safe to run repeatedly and safe to run before the app is updated: the read
 * path accepts both forms, so rows migrated here and rows not yet migrated both
 * keep rendering. Run with dryRun first to see the blast radius.
 *
 *   npx convex run photoMigration:migrateLegacyPhotoUrls '{"dryRun":true}'
 *   npx convex run photoMigration:migrateLegacyPhotoUrls '{}'
 *
 * A URL we do not recognise (not a Convex storage URL) is counted as "skipped"
 * and left exactly as it was — never blanked.
 */

interface Tally {
  scanned: number;
  migrated: number;
  skipped: number;
  alreadyStorageIds: number;
}

const empty = (): Tally => ({
  scanned: 0,
  migrated: 0,
  skipped: 0,
  alreadyStorageIds: 0,
});

/** Converts one ref. Returns null when nothing should change. */
function convertRef(ref: string, tally: Tally): string | null {
  if (!ref) return null;
  tally.scanned += 1;
  if (!isLegacyUrlRef(ref)) {
    tally.alreadyStorageIds += 1;
    return null;
  }
  const storageId = storageIdFromLegacyUrl(ref);
  if (!storageId) {
    // Not one of ours (an external image, a hand-edited value). Leave it: the
    // resolver passes it through, so the record still renders.
    tally.skipped += 1;
    return null;
  }
  tally.migrated += 1;
  return storageId;
}

export const migrateLegacyPhotoUrls = internalMutation({
  args: { dryRun: v.optional(v.boolean()), batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const limit = args.batchSize ?? 500;
    const report: Record<string, Tally> = {
      shifts: empty(),
      incidents: empty(),
      reportSubmissions: empty(),
      postOrderCompletions: empty(),
      handovers: empty(),
    };

    // shifts.clockInPhoto / clockOutPhoto
    for (const row of await ctx.db.query("shifts").take(limit)) {
      const nextIn = convertRef(row.clockInPhoto ?? "", report.shifts);
      const nextOut = convertRef(row.clockOutPhoto ?? "", report.shifts);
      if ((nextIn || nextOut) && !dryRun) {
        await ctx.db.patch(row._id, {
          ...(nextIn ? { clockInPhoto: nextIn } : {}),
          ...(nextOut ? { clockOutPhoto: nextOut } : {}),
        });
      }
    }

    // incidents.photoUrls[]
    for (const row of await ctx.db.query("incidents").take(limit)) {
      const refs = row.photoUrls ?? [];
      if (!refs.length) continue;
      let changed = false;
      const next = refs.map((ref) => {
        const converted = convertRef(ref, report.incidents);
        if (converted) changed = true;
        return converted ?? ref;
      });
      if (changed && !dryRun) await ctx.db.patch(row._id, { photoUrls: next });
    }

    // reportSubmissions.evidenceUrls[]
    for (const row of await ctx.db.query("reportSubmissions").take(limit)) {
      const refs = row.evidenceUrls ?? [];
      if (!refs.length) continue;
      let changed = false;
      const next = refs.map((ref) => {
        const converted = convertRef(ref, report.reportSubmissions);
        if (converted) changed = true;
        return converted ?? ref;
      });
      if (changed && !dryRun) {
        await ctx.db.patch(row._id, { evidenceUrls: next });
      }
    }

    // postOrderCompletions.proofPhotoUrl
    for (const row of await ctx.db.query("postOrderCompletions").take(limit)) {
      const next = convertRef(row.proofPhotoUrl ?? "", report.postOrderCompletions);
      if (next && !dryRun) await ctx.db.patch(row._id, { proofPhotoUrl: next });
    }

    // handovers.photoUrl
    for (const row of await ctx.db.query("handovers").take(limit)) {
      const next = convertRef(row.photoUrl ?? "", report.handovers);
      if (next && !dryRun) await ctx.db.patch(row._id, { photoUrl: next });
    }

    const totals = Object.values(report).reduce(
      (sum, t) => ({
        scanned: sum.scanned + t.scanned,
        migrated: sum.migrated + t.migrated,
        skipped: sum.skipped + t.skipped,
        alreadyStorageIds: sum.alreadyStorageIds + t.alreadyStorageIds,
      }),
      empty(),
    );

    return { dryRun, totals, byTable: report };
  },
});

/**
 * Backfills photoAssets ownership rows for photos that predate that table.
 *
 * Without an asset row a photo still serves (the /photos route falls back to
 * the token check alone), but it gets no tenant re-check and the sweeper has no
 * record of it. This walks the owning records — which is where the tenant
 * actually comes from — and registers what it finds.
 */
export const backfillPhotoAssets = internalMutation({
  args: { dryRun: v.optional(v.boolean()), batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const limit = args.batchSize ?? 500;
    let created = 0;
    let existing = 0;
    let skippedLegacyUrl = 0;

    const register = async (
      ref: string | undefined,
      kind:
        | "clock_in"
        | "clock_out"
        | "incident"
        | "maintenance"
        | "post_order_proof"
        | "handover",
      owner: {
        clientId?: Id<"clients">;
        siteId?: Id<"sites">;
        userId: Id<"users">;
      },
      table: string,
      recordId: string,
      createdAt: number,
    ) => {
      if (!ref) return;
      // An unconverted URL has no storageId to key an asset on; run
      // migrateLegacyPhotoUrls first.
      if (isLegacyUrlRef(ref)) {
        skippedLegacyUrl += 1;
        return;
      }
      const storageId = ref as Id<"_storage">;
      const already = await ctx.db
        .query("photoAssets")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first();
      if (already) {
        existing += 1;
        return;
      }
      created += 1;
      if (dryRun) return;

      // Metadata comes from the system table rather than a guess: these blobs
      // were validated when they were first uploaded.
      const meta = await ctx.db.system.get(storageId);
      await ctx.db.insert("photoAssets", {
        storageId,
        clientId: owner.clientId,
        siteId: owner.siteId,
        uploadedBy: owner.userId,
        kind,
        contentType: meta?.contentType ?? "image/jpeg",
        sizeBytes: meta?.size ?? 0,
        attachedAt: createdAt,
        attachedTable: table,
        attachedId: recordId,
        createdAt,
      });
    };

    for (const row of await ctx.db.query("shifts").take(limit)) {
      const owner = { clientId: row.clientId, siteId: row.siteId, userId: row.userId };
      await register(row.clockInPhoto, "clock_in", owner, "shifts", row._id, row.createdAt);
      await register(row.clockOutPhoto, "clock_out", owner, "shifts", row._id, row.createdAt);
    }

    for (const row of await ctx.db.query("incidents").take(limit)) {
      const owner = { clientId: row.clientId, siteId: row.siteId, userId: row.officerId };
      for (const ref of row.photoUrls ?? []) {
        await register(ref, "incident", owner, "incidents", row._id, row.reportedAt);
      }
    }

    for (const row of await ctx.db.query("reportSubmissions").take(limit)) {
      const owner = { clientId: row.clientId, siteId: row.siteId, userId: row.userId };
      for (const ref of row.evidenceUrls ?? []) {
        await register(ref, "maintenance", owner, "reportSubmissions", row._id, row.submittedAt);
      }
    }

    for (const row of await ctx.db.query("postOrderCompletions").take(limit)) {
      const owner = { clientId: row.clientId, siteId: row.siteId, userId: row.userId };
      await register(
        row.proofPhotoUrl,
        "post_order_proof",
        owner,
        "postOrderCompletions",
        row._id,
        row.createdAt,
      );
    }

    for (const row of await ctx.db.query("handovers").take(limit)) {
      const owner = { clientId: row.clientId, siteId: row.siteId, userId: row.fromUserId };
      await register(row.photoUrl, "handover", owner, "handovers", row._id, row.createdAt);
    }

    return { dryRun, created, existing, skippedLegacyUrl };
  },
});

/**
 * One-shot convenience: convert URLs, then backfill ownership. This is the
 * order that matters — backfilling first would skip every unconverted row.
 */
export const runFullPhotoMigration = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<unknown> => {
    const urls: unknown = await ctx.runMutation(
      internal.photoMigration.migrateLegacyPhotoUrls,
      { dryRun: args.dryRun },
    );
    const assets: unknown = await ctx.runMutation(
      internal.photoMigration.backfillPhotoAssets,
      { dryRun: args.dryRun },
    );
    return { urls, assets };
  },
});
