import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    officerId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("investigating"),
        v.literal("resolved"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    let incidents = await ctx.db.query("incidents").order("desc").collect();

    if (args.officerId) {
      incidents = incidents.filter(
        (incident) => incident.officerId === args.officerId,
      );
    }

    if (args.status) {
      incidents = incidents.filter((incident) => incident.status === args.status);
    }

    return incidents;
  },
});

export const create = mutation({
  args: {
    officerId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    title: v.string(),
    description: v.optional(v.string()),
    severity: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("critical"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("incidents", {
      officerId: args.officerId,
      checkpointId: args.checkpointId,
      title: args.title,
      description: args.description ?? "",
      severity: args.severity ?? "low",
      status: "open",
      reportedAt: Date.now(),
    });
  },
});
