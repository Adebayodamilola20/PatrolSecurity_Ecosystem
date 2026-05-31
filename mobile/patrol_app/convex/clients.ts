import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let clients = await ctx.db.query("clients").collect();
    if (args.clientId) clients = clients.filter(c => c._id === args.clientId);
    return clients.map(c => ({
      id: c.legacyId ?? c._id, convexId: c._id, name: c.name,
      email: c.email, phone: c.phone, active: c.active,
      createdAt: new Date(c.createdAt).toISOString(),
    }));
  },
});

export const getById = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.clientId);
    if (!c) return null;
    return {
      id: c.legacyId ?? c._id,
      convexId: c._id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      active: c.active,
      createdAt: new Date(c.createdAt).toISOString(),
    };
  },
});

export const create = mutation({
  args: { name: v.string(), email: v.string(), phone: v.string(), active: v.boolean() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("clients", { ...args, createdAt: Date.now() });
    return { id, ...args, convexId: id, createdAt: new Date().toISOString() };
  },
});
