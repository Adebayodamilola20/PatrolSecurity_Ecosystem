import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let sites = await ctx.db.query("sites").collect();
    if (args.clientId) sites = sites.filter(s => s.clientId === args.clientId);
    const clients = await ctx.db.query("clients").collect();
    return sites.map(s => ({
      id: s.legacyId ?? s._id, convexId: s._id, name: s.name,
      location: s.location, clientId: s.clientId,
      patrolIntervalMinutes: s.patrolIntervalMinutes ?? null,
      patrolGracePeriodMinutes: s.patrolGracePeriodMinutes ?? null,
      clientName: clients.find(c => c._id === s.clientId)?.name ?? "",
      active: s.active, createdAt: new Date(s.createdAt).toISOString(),
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    location: v.string(),
    clientId: v.id("clients"),
    active: v.boolean(),
    patrolIntervalMinutes: v.optional(v.number()),
    patrolGracePeriodMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("sites", { ...args, createdAt: Date.now() });
    return { id, ...args, convexId: id, createdAt: new Date().toISOString() };
  },
});

export const updatePatrolSettings = mutation({
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
    return updated
      ? {
          id: updated.legacyId ?? updated._id,
          convexId: updated._id,
          name: updated.name,
          location: updated.location,
          clientId: updated.clientId,
          patrolIntervalMinutes: updated.patrolIntervalMinutes ?? null,
          patrolGracePeriodMinutes: updated.patrolGracePeriodMinutes ?? null,
          active: updated.active,
          createdAt: new Date(updated.createdAt).toISOString(),
        }
      : null;
  },
});
