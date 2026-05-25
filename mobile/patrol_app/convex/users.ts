import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const findByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const getSafeProfile = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.active) {
      return null;
    }

    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const client = user.clientId ? await ctx.db.get(user.clientId) : null;

    return {
      id: user.legacyId ?? user._id,
      convexId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      active: user.active,
      clientId: user.clientId,
      clientName: client?.name ?? null,
      liveTracking: user.liveTracking,
      siteIds: assignments.map((assignment) => assignment.siteId),
    };
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return Promise.all(users.map(async (u) => {
      const client = u.clientId ? await ctx.db.get(u.clientId) : null;
      return { id: u.legacyId ?? u._id, convexId: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, active: u.active, clientId: u.clientId, clientName: client?.name ?? null, liveTracking: u.liveTracking, createdAt: new Date(u.createdAt).toISOString() };
    }));
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.userId);
    if (!u) return null;
    const client = u.clientId ? await ctx.db.get(u.clientId) : null;
    return { id: u.legacyId ?? u._id, convexId: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, active: u.active, clientId: u.clientId, clientName: client?.name ?? null, liveTracking: u.liveTracking, createdAt: new Date(u.createdAt).toISOString() };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("main_account"), v.literal("supervisor"), v.literal("guard")),
    phone: v.string(),
    active: v.boolean(),
    clientId: v.optional(v.id("clients")),
    liveTracking: v.boolean(),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("users", args);
    return id;
  },
});

export const changePassword = mutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
    });
  },
});
