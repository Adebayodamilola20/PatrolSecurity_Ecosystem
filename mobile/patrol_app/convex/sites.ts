import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

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
