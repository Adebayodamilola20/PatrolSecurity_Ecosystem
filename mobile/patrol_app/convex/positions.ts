import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const record = mutation({
  args: {
    userId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    speed: v.optional(v.number()),
    heading: v.optional(v.number()),
    capturedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const assignment = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    await ctx.db.insert("officerPositions", {
      clientId: user?.clientId,
      siteId: assignment?.siteId,
      userId: args.userId,
      latitude: args.latitude,
      longitude: args.longitude,
      accuracy: args.accuracy,
      speed: args.speed,
      heading: args.heading,
      capturedAt: args.capturedAt ?? Date.now(),
    });
    return { status: "ok" };
  },
});
