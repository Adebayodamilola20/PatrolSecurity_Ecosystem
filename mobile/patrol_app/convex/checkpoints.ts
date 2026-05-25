import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    clientLegacyId: v.optional(v.string()),
    siteLegacyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let checkpoints = await ctx.db.query("checkpoints").collect();

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

export const listForApi = query({
  args: {},
  handler: async (ctx) => {
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const scans = await ctx.db.query("scans").collect();

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
          latitude: checkpoint.latitude,
          longitude: checkpoint.longitude,
          radiusMeters: checkpoint.radiusMeters,
          active: checkpoint.active,
          totalScans: checkpointScans.length,
          lastScan: latestScan
            ? new Date(latestScan.scannedAt).toISOString()
            : null,
        };
      });
  },
});

export const resolveId = query({
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
    return checkpoints.find((checkpoint) => checkpoint._id === args.id)?._id ?? null;
  },
});
