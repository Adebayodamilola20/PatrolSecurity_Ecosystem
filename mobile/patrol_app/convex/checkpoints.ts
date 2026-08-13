import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { findDeletedCheckpoint, recordTombstone } from "./lib/tombstones";
import { isAssignedToSite, isAssignedUnderClient } from "./lib/authHelpers";

export const list = internalQuery({
  args: {
    activeOnly: v.optional(v.boolean()),
    clientLegacyId: v.optional(v.string()),
    siteLegacyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let checkpoints = await ctx.db.query("checkpoints").take(500);

    if (args.activeOnly !== false) {
      checkpoints = checkpoints.filter((checkpoint) => checkpoint.active);
    }

    if (args.clientLegacyId) {
      const client = await ctx.db
        .query("clients")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", args.clientLegacyId))
        .unique();
      checkpoints = checkpoints.filter(
        (checkpoint) => checkpoint.clientId === client?._id,
      );
    }

    if (args.siteLegacyId) {
      const site = await ctx.db
        .query("sites")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", args.siteLegacyId))
        .unique();
      checkpoints = checkpoints.filter(
        (checkpoint) => checkpoint.siteId === site?._id,
      );
    }

    return checkpoints;
  },
});

export const listForApi = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const query = args.clientId
      ? ctx.db.query("checkpoints").withIndex("by_clientId", (q) =>
          q.eq("clientId", args.clientId),
        )
      : ctx.db.query("checkpoints");
    let checkpoints = await query.take(200);

    if (args.clientId) {
      checkpoints = checkpoints.filter((cp) => cp.clientId === args.clientId);
    }

    const scans = await ctx.db.query("scans").take(500);
    const sites = await ctx.db.query("sites").collect();

    return checkpoints
      .filter((checkpoint) => checkpoint.active)
      .map((checkpoint) => {
        const checkpointScans = scans.filter(
          (scan) => scan.checkpointId === checkpoint._id,
        );
        const latestScan = checkpointScans
          .slice()
          .sort((a, b) => b.scannedAt - a.scannedAt)[0];
        // Parent location + its geofence: what scans at plain QR points
        // (no own GPS) are actually verified against.
        const site = checkpoint.siteId
          ? sites.find((s) => s._id === checkpoint.siteId)
          : undefined;

        return {
          id: checkpoint.legacyId ?? checkpoint._id,
          name: checkpoint.name,
          code: checkpoint.code,
          location: "",
          siteId: checkpoint.siteId,
          clientId: checkpoint.clientId,
          siteName: site?.name ?? null,
          siteLatitude: site?.latitude ?? null,
          siteLongitude: site?.longitude ?? null,
          siteRadiusMeters: site?.radiusMeters ?? null,
          isPrimary: checkpoint.isPrimary ?? false,
          latitude: checkpoint.latitude,
          longitude: checkpoint.longitude,
          radiusMeters: checkpoint.radiusMeters,
          expectedIntervalMinutes: checkpoint.expectedIntervalMinutes,
          scheduledTimeIn: checkpoint.scheduledTimeIn,
          scheduledTimeOut: checkpoint.scheduledTimeOut,
          active: checkpoint.active,
          totalScans: checkpointScans.length,
          lastScan: latestScan
            ? new Date(latestScan.scannedAt).toISOString()
            : null,
        };
      });
  },
});

const cpShape = (cp: any, site?: any) => ({
  id: cp.legacyId ?? cp._id,
  name: cp.name,
  code: cp.code,
  latitude: cp.latitude,
  longitude: cp.longitude,
  radiusMeters: cp.radiusMeters,
  expectedIntervalMinutes: cp.expectedIntervalMinutes,
  scheduledTimeIn: cp.scheduledTimeIn,
  scheduledTimeOut: cp.scheduledTimeOut,
  active: cp.active,
  siteId: cp.siteId,
  clientId: cp.clientId,
  siteName: site?.name ?? null,
  createdAt: new Date(cp.createdAt).toISOString(),
});

export const create = internalMutation({
  args: {
    name: v.string(),
    code: v.string(),
    // Sub-locations are plain QR points: no coordinates of their own. Scans
    // are then verified against the parent site geofence instead.
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    radiusMeters: v.optional(v.number()),
    expectedIntervalMinutes: v.number(),
    scheduledTimeIn: v.string(),
    scheduledTimeOut: v.string(),
    active: v.boolean(),
    siteId: v.optional(v.id("sites")),
    clientId: v.optional(v.id("clients")),
    isPrimary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const site = args.siteId ? await ctx.db.get(args.siteId) : null;
    if (args.siteId && !site) throw new Error("Site not found");
    const createdAt = Date.now();
    const value = {
      ...args,
      clientId: args.clientId ?? site?.clientId,
      createdAt,
    };
    const id = await ctx.db.insert("checkpoints", value);
    return cpShape({ ...value, _id: id }, site);
  },
});

// One-off backfill: give every existing site its own primary QR point, so
// locations created before this feature also get a location QR code.
// Run with: npx convex run checkpoints:backfillPrimary
export const backfillPrimary = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sites = await ctx.db.query("sites").collect();
    let created = 0;
    for (const site of sites) {
      const existing = await ctx.db
        .query("checkpoints")
        .withIndex("by_siteId", (q) => q.eq("siteId", site._id))
        .collect();
      if (existing.some((cp) => cp.isPrimary)) continue;
      await ctx.db.insert("checkpoints", {
        clientId: site.clientId,
        siteId: site._id,
        name: site.name,
        code: crypto.randomUUID(),
        expectedIntervalMinutes: 60,
        scheduledTimeIn: "",
        scheduledTimeOut: "",
        active: true,
        isPrimary: true,
        createdAt: Date.now(),
      });
      created += 1;
    }
    return { created };
  },
});

export const update = internalMutation({
  args: {
    checkpointId: v.id("checkpoints"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    radiusMeters: v.optional(v.number()),
    expectedIntervalMinutes: v.optional(v.number()),
    scheduledTimeIn: v.optional(v.string()),
    scheduledTimeOut: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { checkpointId, ...fields } = args;
    await ctx.db.patch(checkpointId, fields as any);
    const updated = await ctx.db.get(checkpointId);
    const site = updated?.siteId ? await ctx.db.get(updated.siteId) : undefined;
    return updated ? cpShape(updated, site) : null;
  },
});

export const remove = internalMutation({
  args: {
    checkpointId: v.id("checkpoints"),
    deletedByUserId: v.optional(v.id("users")),
    deletedByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Tombstone first, same as deleting a whole location: without it the QR
    // becomes an unrecognised code rather than a withdrawn one, and the name
    // disappears from every scan already recorded against it.
    const checkpoint = await ctx.db.get(args.checkpointId);
    if (checkpoint) {
      const site = checkpoint.siteId
        ? await ctx.db.get(checkpoint.siteId)
        : null;
      await recordTombstone(ctx, {
        entityType: "checkpoint",
        entityId: checkpoint._id,
        legacyId: checkpoint.legacyId,
        contextName: site?.name,
        name: checkpoint.name,
        deletedByUserId: args.deletedByUserId,
        deletedByName: args.deletedByName,
      });
    }
    const postings = await ctx.db
      .query("userCheckpointAssignments")
      .withIndex("by_checkpointId", (q) =>
        q.eq("checkpointId", args.checkpointId),
      )
      .collect();
    for (const posting of postings) await ctx.db.delete(posting._id);

    await ctx.db.delete(args.checkpointId);
  },
});

// Post a guard to one sub-location.
//
// Unlike site assignments this is many-to-many on purpose: a guard can hold
// the front gate and the back gate on the same shift, and a busy gate can be
// double-manned. Idempotent, so re-posting someone already there is a no-op.
//
// A posting is worthless if the guard's scans there would be rejected, so the
// parent site assignment is created alongside it. That site-level rule is
// still one guard, one location, so a guard already posted to a different
// location comes back as a conflict rather than a half-made posting.
export const assignUser = internalMutation({
  args: { checkpointId: v.id("checkpoints"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db.get(args.checkpointId);
    if (!checkpoint) throw new Error("Checkpoint not found");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Belonging to the location is derived, never chosen: posting someone to a
    // gate registers them at the location in the same click. The old
    // one-guard-one-location rule is deliberately not applied here — guards
    // and supervisors cover several properties, and refusing the posting left
    // staff staring at a gate assignment that silently did nothing.
    const siteId = checkpoint.siteId;
    if (siteId) {
      const postedToSite = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId_siteId", (q) =>
          q.eq("userId", args.userId).eq("siteId", siteId),
        )
        .first();
      if (!postedToSite) {
        const site = await ctx.db.get(siteId);
        await ctx.db.insert("userSiteAssignments", {
          clientId: site?.clientId,
          userId: args.userId,
          siteId,
          createdAt: Date.now(),
        });
      }
    }

    const existing = await ctx.db
      .query("userCheckpointAssignments")
      .withIndex("by_userId_checkpointId", (q) =>
        q.eq("userId", args.userId).eq("checkpointId", args.checkpointId),
      )
      .first();
    if (existing) return { id: existing._id, alreadyAssigned: true };

    const id = await ctx.db.insert("userCheckpointAssignments", {
      clientId: checkpoint.clientId,
      siteId: checkpoint.siteId,
      userId: args.userId,
      checkpointId: args.checkpointId,
      createdAt: Date.now(),
    });
    return { id, alreadyAssigned: false };
  },
});

// Pulling a guard off their last gate at a location pulls them off the
// location too.
//
// Keeping the location assignment behind looked like a safe half-measure and
// was not: the guard vanished from every gate while the location still listed
// them as posted and still accepted their scans there. Staff pressed ✕, saw
// nothing change at the top of the page, and reasonably concluded the button
// was broken. Hold another gate here and the location assignment stays.
export const unassignUser = internalMutation({
  args: { checkpointId: v.id("checkpoints"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userCheckpointAssignments")
      .withIndex("by_userId_checkpointId", (q) =>
        q.eq("userId", args.userId).eq("checkpointId", args.checkpointId),
      )
      .first();
    if (!existing) return { removed: false, removedFromSite: false };
    await ctx.db.delete(existing._id);

    const checkpoint = await ctx.db.get(args.checkpointId);
    const siteId = checkpoint?.siteId ?? existing.siteId;
    if (!siteId) return { removed: true, removedFromSite: false };

    const stillHere = await ctx.db
      .query("userCheckpointAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    if (stillHere.some((p) => p.siteId === siteId)) {
      return { removed: true, removedFromSite: false };
    }

    const siteAssignment = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId_siteId", (q) =>
        q.eq("userId", args.userId).eq("siteId", siteId),
      )
      .first();
    if (siteAssignment) await ctx.db.delete(siteAssignment._id);
    return { removed: true, removedFromSite: !!siteAssignment };
  },
});

/**
 * What a scanned QR code actually is, from the server's point of view.
 *
 * The app can only see checkpoints it was served, so a code missing from its
 * list is ambiguous: withdrawn location, a post this guard does not hold, a
 * deactivated point, or a code from another company entirely. Guessing gets a
 * guard standing at a gate retrying a scan that will never succeed, so the
 * server says which it is and the app repeats that verdict verbatim.
 */
export const lookupForScan = internalQuery({
  args: { code: v.string(), officerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const raw = args.code.trim();
    if (!raw) return { status: "unknown" as const };

    const byLegacyId = await ctx.db
      .query("checkpoints")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", raw))
      .unique();
    const all = byLegacyId
      ? null
      : await ctx.db.query("checkpoints").collect();
    const checkpoint =
      byLegacyId ??
      all?.find((c) => c._id === raw || c.code === raw) ??
      null;

    // [info-disclosure] Nameless on purpose, and the reason every refusal below
    // is shaped the same way. A guard holding a code they are not posted to
    // must learn that the scan cannot be recorded — not which company or
    // location the code belongs to. Anything else turns a printed QR into a
    // lookup service for another tenant's site names. The app renders the
    // message on its own when these are null.
    const refused = {
      status: "not_assigned" as const,
      name: null,
      siteName: null,
    };

    if (!checkpoint) {
      const tombstone = await findDeletedCheckpoint(ctx, raw);
      if (tombstone) {
        // Deleting a location deletes its checkpoints and its assignments
        // together, so by the time this row is a tombstone there is nothing
        // left to check a guard against. The verdict still tells them to ring
        // the office, which is the part of it they act on; the name is dropped
        // because it cannot be shown to the right people only.
        return {
          status: "deleted" as const,
          name: null,
          siteName: null,
          deletedAt: new Date(tombstone.deletedAt).toISOString(),
        };
      }
      return { status: "unknown" as const };
    }

    // Scope first. Withdrawn, switched off and working are all facts about
    // somebody's location, so the caller has to be posted there before any of
    // them is an answer they are entitled to.
    if (args.officerId) {
      const posted = checkpoint.siteId
        ? await isAssignedToSite(ctx, args.officerId, checkpoint.siteId)
        : checkpoint.clientId
          ? await isAssignedUnderClient(ctx, args.officerId, checkpoint.clientId)
          : true;
      if (!posted) return refused;
    }

    const site = checkpoint.siteId ? await ctx.db.get(checkpoint.siteId) : null;
    // A checkpoint whose parent location row is gone is withdrawn in every way
    // that matters to a guard, even though this row outlived the cascade.
    if (checkpoint.siteId && !site) {
      return {
        status: "deleted" as const,
        name: checkpoint.name,
        siteName: null,
        deletedAt: null,
      };
    }
    if (!checkpoint.active) {
      return {
        status: "inactive" as const,
        name: checkpoint.name,
        siteName: site?.name ?? null,
      };
    }

    return {
      status: "active" as const,
      name: checkpoint.name,
      siteName: site?.name ?? null,
    };
  },
});

export const resolveId = internalQuery({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("checkpoints")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) {
      return byLegacyId._id;
    }

    const checkpoints = await ctx.db.query("checkpoints").collect();
    return (
      checkpoints.find((checkpoint) => checkpoint._id === args.id)?._id ?? null
    );
  },
});
