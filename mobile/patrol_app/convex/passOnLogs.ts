import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listForUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return [];

    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const siteIds = new Set(assignments.map((assignment) => assignment.siteId));
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const userCheckpointIds = new Set(
      checkpoints
        .filter((checkpoint) => checkpoint.siteId && siteIds.has(checkpoint.siteId))
        .map((checkpoint) => checkpoint._id),
    );
    const logs = await ctx.db.query("passOnLogs").order("desc").collect();
    const users = await ctx.db.query("users").collect();

    return logs
      .filter((log) => {
        if (user.role === "admin") return true;
        if (user.role === "main_account") {
          if (!user.clientId) return false;
          const checkpoint = checkpoints.find((item) => item._id === log.checkpointId);
          return checkpoint?.clientId === user.clientId;
        }
        return (
          !log.checkpointId ||
          userCheckpointIds.has(log.checkpointId) ||
          log.createdBy === args.userId
        );
      })
      .map((log) => ({
        id: log.legacyId ?? log._id,
        title: log.title,
        instruction: log.instruction,
        priority: log.priority,
        siteLabel: log.siteLabel,
        checkpointId: log.checkpointId ?? null,
        requiresAcknowledgement: log.requiresAcknowledgement,
        createdBy: log.createdBy,
        createdByName: users.find((item) => item._id === log.createdBy)?.name ?? "",
        active: log.active,
        createdAt: new Date(log.createdAt).toISOString(),
      }));
  },
});

export const listPendingForUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const available = await ctx.db.query("passOnLogs").collect();
    const acknowledgements = await ctx.db
      .query("passOnLogAcknowledgements")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const acked = new Set(acknowledgements.map((ack) => ack.passOnLogId));
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const user = await ctx.db.get(args.userId);
    if (!user) return [];
    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const siteIds = new Set(assignments.map((assignment) => assignment.siteId));
    const userCheckpointIds = new Set(
      checkpoints
        .filter((checkpoint) => checkpoint.siteId && siteIds.has(checkpoint.siteId))
        .map((checkpoint) => checkpoint._id),
    );
    return available
      .filter(
        (log) =>
          log.active &&
          (!log.checkpointId ||
            userCheckpointIds.has(log.checkpointId) ||
            log.createdBy === args.userId) &&
          !acked.has(log._id),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((log) => ({
        id: log.legacyId ?? log._id,
        title: log.title,
        instruction: log.instruction,
        priority: log.priority,
        siteLabel: log.siteLabel,
        checkpointId: log.checkpointId ?? null,
        requiresAcknowledgement: log.requiresAcknowledgement,
        createdBy: log.createdBy,
        createdByName: users.find((item) => item._id === log.createdBy)?.name ?? "",
        acknowledged: false,
        active: log.active,
        createdAt: new Date(log.createdAt).toISOString(),
      }));
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    instruction: v.string(),
    priority: v.optional(v.string()),
    siteLabel: v.optional(v.string()),
    checkpointId: v.optional(v.id("checkpoints")),
    requiresAcknowledgement: v.optional(v.boolean()),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("passOnLogs", {
      title: args.title,
      instruction: args.instruction,
      priority: args.priority ?? "normal",
      siteLabel: args.siteLabel ?? "",
      checkpointId: args.checkpointId,
      requiresAcknowledgement: args.requiresAcknowledgement ?? false,
      createdBy: args.createdBy,
      active: true,
      createdAt: Date.now(),
    });
    const creator = await ctx.db.get(args.createdBy);
    return {
      id,
      title: args.title,
      instruction: args.instruction,
      priority: args.priority ?? "normal",
      siteLabel: args.siteLabel ?? "",
      checkpointId: args.checkpointId ?? null,
      requiresAcknowledgement: args.requiresAcknowledgement ?? false,
      createdBy: args.createdBy,
      createdByName: creator?.name ?? "",
      active: true,
      createdAt: new Date().toISOString(),
    };
  },
});

export const acknowledge = mutation({
  args: {
    passOnLogId: v.id("passOnLogs"),
    userId: v.id("users"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("passOnLogAcknowledgements")
      .withIndex("by_passOnLogId_userId", (q) =>
        q.eq("passOnLogId", args.passOnLogId).eq("userId", args.userId),
      )
      .unique();
    if (existing) {
      return {
        id: existing.legacyId ?? existing._id,
        passOnLogId: args.passOnLogId,
        userId: args.userId,
        acknowledgedAt: new Date(existing.acknowledgedAt).toISOString(),
        note: existing.note,
      };
    }
    const now = Date.now();
    const id = await ctx.db.insert("passOnLogAcknowledgements", {
      passOnLogId: args.passOnLogId,
      userId: args.userId,
      acknowledgedAt: now,
      note: args.note ?? "",
    });
    return {
      id,
      passOnLogId: args.passOnLogId,
      userId: args.userId,
      acknowledgedAt: new Date(now).toISOString(),
      note: args.note ?? "",
    };
  },
});

export const resolveId = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("passOnLogs").collect();
    return (
      all.find((item) => item.legacyId === args.id || item._id === args.id)?._id ??
      null
    );
  },
});
