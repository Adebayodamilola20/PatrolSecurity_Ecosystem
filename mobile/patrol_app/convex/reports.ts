import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const listSubmissions = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const query = args.userId
      ? ctx.db.query("reportSubmissions").withIndex("by_userId_submittedAt", (q) =>
          q.eq("userId", args.userId!),
        ).order("desc")
      : args.type
        ? ctx.db.query("reportSubmissions").withIndex("by_type", (q) => q.eq("type", args.type!)).order("desc")
        : ctx.db.query("reportSubmissions").order("desc");
    let submissions = await query.take(100);

    if (args.userId && args.type) {
      submissions = submissions.filter(
        (submission) => submission.type === args.type,
      );
    }

    return submissions;
  },
});

export const listAll = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const query = args.clientId
      ? ctx.db.query("reportSubmissions").withIndex("by_clientId_submittedAt", (q) =>
          q.eq("clientId", args.clientId),
        )
      : ctx.db.query("reportSubmissions");
    let subs = await query.order("desc").take(100);
    const users = await ctx.db.query("users").collect();
    if (args.clientId) {
      const clientUserIds = new Set(
        users.filter((u) => u.clientId === args.clientId).map((u) => u._id),
      );
      subs = subs.filter(
        (s) => s.clientId === args.clientId || clientUserIds.has(s.userId),
      );
    }
    return {
      reports: [],
      submissions: subs.map((s) => ({
        id: s.legacyId ?? s._id,
        type: s.type,
        title: s.title,
        summary: s.summary,
        status: s.status,
        siteLabel: s.siteLabel,
        userName: users.find((u) => u._id === s.userId)?.name ?? "",
        submittedAt: new Date(s.submittedAt).toISOString(),
        emailedAt: s.emailedAt ? new Date(s.emailedAt).toISOString() : null,
      })),
    };
  },
});

export const generate = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.optional(v.string()),
    dateRange: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const subId = await ctx.db.insert("reportSubmissions", {
      clientId: user?.clientId,
      type: args.type ?? "generated",
      title: "Generated Report",
      summary: "Auto-generated",
      details: {},
      userId: args.userId,
      status: "submitted",
      submittedAt: Date.now(),
      deliveryPayload: {},
      siteLabel: "",
    });
    return {
      id: subId,
      message: "Report generation started",
      status: "submitted",
    };
  },
});

const VALID_REPORT_TYPES = ["daily-activity", "incident", "maintenance", "pass-on-log", "generated"] as const;

function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

export const submit = internalMutation({
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
    if (!VALID_REPORT_TYPES.includes(args.type as typeof VALID_REPORT_TYPES[number])) {
      throw new Error(
        `Invalid report type: "${args.type}". Must be one of: ${VALID_REPORT_TYPES.join(", ")}`,
      );
    }

    const title = sanitize(args.title);
    const summary = sanitize(args.summary);

    const recent = await ctx.db
      .query("reportSubmissions")
      .withIndex("by_userId_submittedAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    if (
      recent &&
      recent.status === "submitted" &&
      recent.type === args.type &&
      Date.now() - recent.submittedAt < 60_000
    ) {
      throw new Error(
        `Duplicate submission: ${args.type} report already submitted within 60 seconds`,
      );
    }

    const user = await ctx.db.get(args.userId);
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;

    console.log("[REPORT_SUBMIT]", JSON.stringify({
      userId: args.userId,
      type: args.type,
      title,
    }));

    return await ctx.db.insert("reportSubmissions", {
      clientId: checkpoint?.clientId ?? user?.clientId,
      siteId: checkpoint?.siteId,
      type: args.type,
      title,
      summary,
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
