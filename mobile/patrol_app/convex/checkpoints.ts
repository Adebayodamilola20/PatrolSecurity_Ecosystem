import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

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

    return checkpoints
      .filter((checkpoint) => checkpoint.active)
      .map((checkpoint) => {
        const checkpointScans = scans.filter(
          (scan) => scan.checkpointId === checkpoint._id,
        );
        const latestScan = checkpointScans
          .slice()
          .sort((a, b) => b.scannedAt - a.scannedAt)[0];

        return {
          id: checkpoint.legacyId ?? checkpoint._id,
          name: checkpoint.name,
          code: checkpoint.code,
          location: "",
          siteId: checkpoint.siteId,
          clientId: checkpoint.clientId,
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
  args: { checkpointId: v.id("checkpoints") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.checkpointId);
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
