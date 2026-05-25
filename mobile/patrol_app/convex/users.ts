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
