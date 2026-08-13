import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { recordTombstone } from "./lib/tombstones";

const siteShape = (s: Doc<"sites">, clientName?: string) => ({
  id: s.legacyId ?? s._id,
  convexId: s._id,
  name: s.name,
  location: s.location,
  address: s.address ?? null,
  latitude: s.latitude ?? null,
  longitude: s.longitude ?? null,
  radiusMeters: s.radiusMeters ?? null,
  clientId: s.clientId,
  patrolIntervalMinutes: s.patrolIntervalMinutes ?? null,
  patrolGracePeriodMinutes: s.patrolGracePeriodMinutes ?? null,
  ...(clientName !== undefined ? { clientName } : {}),
  active: s.active,
  createdAt: new Date(s.createdAt).toISOString(),
});

export const list = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let sites = await ctx.db.query("sites").collect();
    if (args.clientId) sites = sites.filter(s => s.clientId === args.clientId);
    const clients = await ctx.db.query("clients").collect();
    return sites.map(s =>
      siteShape(s, clients.find(c => c._id === s.clientId)?.name ?? ""),
    );
  },
});

export const getById = internalQuery({
  args: { siteId: v.id("sites") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.siteId);
    return s ? siteShape(s) : null;
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("sites")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) return byLegacyId._id;
    const all = await ctx.db.query("sites").collect();
    return all.find(s => s._id === args.id)?._id ?? null;
  },
});

export const create = internalMutation({
  args: {
    name: v.string(),
    location: v.string(),
    address: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    radiusMeters: v.optional(v.number()),
    clientId: v.id("clients"),
    active: v.boolean(),
    patrolIntervalMinutes: v.optional(v.number()),
    patrolGracePeriodMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("sites", { ...args, createdAt: Date.now() });
    const created = await ctx.db.get(id);
    return created ? siteShape(created) : null;
  },
});

export const update = internalMutation({
  args: {
    siteId: v.id("sites"),
    name: v.optional(v.string()),
    location: v.optional(v.string()),
    address: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    radiusMeters: v.optional(v.number()),
    active: v.optional(v.boolean()),
    patrolIntervalMinutes: v.optional(v.number()),
    patrolGracePeriodMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { siteId, ...patch } = args;
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(siteId, cleanPatch as any);
    const updated = await ctx.db.get(siteId);
    return updated ? siteShape(updated) : null;
  },
});

export const updatePatrolSettings = internalMutation({
  args: {
    siteId: v.id("sites"),
    patrolIntervalMinutes: v.optional(v.number()),
    patrolGracePeriodMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const site = await ctx.db.get(args.siteId);
    if (!site) throw new Error("Site not found");

    await ctx.db.patch(args.siteId, {
      patrolIntervalMinutes: args.patrolIntervalMinutes,
      patrolGracePeriodMinutes: args.patrolGracePeriodMinutes,
    });

    const updated = await ctx.db.get(args.siteId);
    return updated ? siteShape(updated) : null;
  },
});

/**
 * What deleting a location would take with it. Read before the confirm dialog
 * so staff see the QR codes and postings that stop working, not just the name.
 */
export const getDeletionImpact = internalQuery({
  args: { siteId: v.id("sites") },
  handler: async (ctx, args) => {
    const site = await ctx.db.get(args.siteId);
    if (!site) return null;
    const [checkpoints, assignments, scans, postOrders] = await Promise.all([
      ctx.db
        .query("checkpoints")
        .withIndex("by_siteId", (q) => q.eq("siteId", args.siteId))
        .collect(),
      ctx.db
        .query("userSiteAssignments")
        .withIndex("by_siteId", (q) => q.eq("siteId", args.siteId))
        .collect(),
      ctx.db
        .query("scans")
        .withIndex("by_siteId", (q) => q.eq("siteId", args.siteId))
        .collect(),
      ctx.db
        .query("postOrders")
        .withIndex("by_siteId", (q) => q.eq("siteId", args.siteId))
        .collect(),
    ]);
    const guardNames = await Promise.all(
      assignments.map(async (a) => (await ctx.db.get(a.userId))?.name ?? null),
    );
    return {
      name: site.name,
      // The location's own QR point is created with it and is not a
      // sub-location, so it is counted separately from what staff added.
      subLocations: checkpoints.filter((c) => !c.isPrimary).length,
      qrCodes: checkpoints.length,
      scans: scans.length,
      activePostOrders: postOrders.filter((p) => p.active).length,
      assignedGuards: guardNames.filter((n): n is string => !!n),
    };
  },
});

/**
 * Hard-deletes a location: the site, every QR point inside it, and the guard
 * postings to it.
 *
 * Scans, reports and shifts taken there are deliberately kept — they are the
 * record of patrols that really happened, and shifts already carry their own
 * `siteLabel`. Tombstones keep the location and checkpoint names readable on
 * that history.
 *
 * The QR codes must go: a checkpoint row left behind is still scannable, so a
 * guard could keep logging patrols at a location the company no longer covers.
 * Post orders are deactivated rather than deleted — they are instructions with
 * their own acknowledgement history, but must stop being served.
 */
export const remove = internalMutation({
  args: {
    siteId: v.id("sites"),
    deletedByUserId: v.optional(v.id("users")),
    deletedByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const site = await ctx.db.get(args.siteId);
    if (!site) return null;

    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_siteId", (q) => q.eq("siteId", args.siteId))
      .collect();
    for (const checkpoint of checkpoints) {
      // Close any open missed-patrol alert first: an alert for a location that
      // no longer exists is noise staff can never action.
      const openAlerts = await ctx.db
        .query("missedPatrolAlerts")
        .withIndex("by_checkpointId_status", (q) =>
          q.eq("checkpointId", checkpoint._id).eq("status", "open"),
        )
        .collect();
      for (const alert of openAlerts) {
        await ctx.db.patch(alert._id, { status: "resolved", resolvedAt: Date.now() });
      }
      await recordTombstone(ctx, {
        entityType: "checkpoint",
        entityId: checkpoint._id,
        // Both id forms and the parent name: a guard scanning this QR after the
        // location is gone has to be told which site was withdrawn, and the QR
        // may carry either id.
        legacyId: checkpoint.legacyId,
        contextName: site.name,
        name: checkpoint.name,
        deletedByUserId: args.deletedByUserId,
        deletedByName: args.deletedByName,
      });
      // Postings to this gate go with it — a posting to a QR point that no
      // longer exists can never be actioned or removed from the UI.
      const postings = await ctx.db
        .query("userCheckpointAssignments")
        .withIndex("by_checkpointId", (q) =>
          q.eq("checkpointId", checkpoint._id),
        )
        .collect();
      for (const posting of postings) await ctx.db.delete(posting._id);
      await ctx.db.delete(checkpoint._id);
    }

    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_siteId", (q) => q.eq("siteId", args.siteId))
      .collect();
    for (const assignment of assignments) await ctx.db.delete(assignment._id);

    const postOrders = await ctx.db
      .query("postOrders")
      .withIndex("by_siteId", (q) => q.eq("siteId", args.siteId))
      .collect();
    let postOrdersDeactivated = 0;
    for (const order of postOrders) {
      if (!order.active) continue;
      await ctx.db.patch(order._id, { active: false });
      postOrdersDeactivated++;
    }

    await recordTombstone(ctx, {
      entityType: "site",
      entityId: args.siteId,
      name: site.name,
      deletedByUserId: args.deletedByUserId,
      deletedByName: args.deletedByName,
    });

    await ctx.db.delete(args.siteId);

    return {
      name: site.name,
      checkpointsRemoved: checkpoints.length,
      assignmentsRemoved: assignments.length,
      postOrdersDeactivated,
    };
  },
});

// Guards must be assigned to a site before their scans there are accepted.
// Idempotent: re-assigning an already-assigned guard is a no-op.
export const assignUser = internalMutation({
  args: { siteId: v.id("sites"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId_siteId", (q) =>
        q.eq("userId", args.userId).eq("siteId", args.siteId),
      )
      .first();
    if (existing) return { id: existing._id, alreadyAssigned: true };
    const site = await ctx.db.get(args.siteId);
    if (!site) throw new Error("Site not found");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    // There used to be a one-guard-one-location rule here. It is gone: guards
    // and supervisors cover several properties, and with location membership
    // now derived from gate postings the rule could only ever surface as a
    // gate assignment that silently refused to save.
    const id = await ctx.db.insert("userSiteAssignments", {
      clientId: site.clientId,
      userId: args.userId,
      siteId: args.siteId,
      createdAt: Date.now(),
    });
    return { id, alreadyAssigned: false };
  },
});

// Removing someone from a location removes them from every gate in it. A gate
// posting without the location assignment behind it is a guard who looks
// posted and whose scans are rejected on arrival.
export const unassignUser = internalMutation({
  args: { siteId: v.id("sites"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId_siteId", (q) =>
        q.eq("userId", args.userId).eq("siteId", args.siteId),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);

    const postings = await ctx.db
      .query("userCheckpointAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    let postsRemoved = 0;
    for (const posting of postings) {
      if (posting.siteId !== args.siteId) continue;
      await ctx.db.delete(posting._id);
      postsRemoved++;
    }
    return { removed: !!existing, postsRemoved };
  },
});
