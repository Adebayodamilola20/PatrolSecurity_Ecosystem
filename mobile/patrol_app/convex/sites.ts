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

export const getById = query({
  args: { siteId: v.id("sites") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.siteId);
    if (!s) return null;
    return {
      id: s.legacyId ?? s._id, convexId: s._id, name: s.name,
      location: s.location, clientId: s.clientId,
      patrolIntervalMinutes: s.patrolIntervalMinutes ?? null,
      patrolGracePeriodMinutes: s.patrolGracePeriodMinutes ?? null,
      active: s.active, createdAt: new Date(s.createdAt).toISOString(),
    };
  },
});

export const resolveId = query({
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

export const update = mutation({
  args: {
    siteId: v.id("sites"),
    name: v.optional(v.string()),
    location: v.optional(v.string()),
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
