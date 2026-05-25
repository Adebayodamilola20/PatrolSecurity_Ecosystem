import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listSubmissions = query({
  args: {
    userId: v.optional(v.id("users")),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let submissions = await ctx.db
      .query("reportSubmissions")
      .order("desc")
      .collect();

    if (args.userId) {
      submissions = submissions.filter(
        (submission) => submission.userId === args.userId,
      );
    }
    if (args.type) {
      submissions = submissions.filter(
        (submission) => submission.type === args.type,
      );
    }

    return submissions;
  },
});

export const submit = mutation({
  args: {
    type: v.string(),
    title: v.string(),
    summary: v.string(),
    details: v.any(),
    checkpointId: v.optional(v.id("checkpoints")),
    siteLabel: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("reportSubmissions", {
      type: args.type,
      title: args.title,
      summary: args.summary,
      details: args.details,
      checkpointId: args.checkpointId,
      siteLabel: args.siteLabel ?? "",
      userId: args.userId,
      status: "submitted",
      submittedAt: Date.now(),
      deliveryPayload: {},
    });
  },
});
