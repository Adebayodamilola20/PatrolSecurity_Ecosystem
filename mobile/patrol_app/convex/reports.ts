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

export const listAll = query({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let subs = await ctx.db.query("reportSubmissions").order("desc").collect();
    const users = await ctx.db.query("users").collect();
    if (args.clientId) {
      const clientUserIds = new Set(users.filter(u => u.clientId === args.clientId).map(u => u._id));
      subs = subs.filter(s => clientUserIds.has(s.userId));
    }
    return { reports: [], submissions: subs.map(s => ({
      id: s.legacyId ?? s._id, type: s.type, title: s.title, summary: s.summary,
      status: s.status, siteLabel: s.siteLabel,
      userName: users.find(u => u._id === s.userId)?.name ?? "",
      submittedAt: new Date(s.submittedAt).toISOString(),
      emailedAt: s.emailedAt ? new Date(s.emailedAt).toISOString() : null,
    })) };
  },
});

export const generate = mutation({
  args: { userId: v.id("users"), type: v.optional(v.string()), dateRange: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const subId = await ctx.db.insert("reportSubmissions", {
      type: args.type ?? "generated", title: "Generated Report", summary: "Auto-generated",
      details: {}, userId: args.userId, status: "submitted", submittedAt: Date.now(),
      deliveryPayload: {}, siteLabel: "",
    });
    return { id: subId, message: "Report generation started", status: "submitted" };
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
