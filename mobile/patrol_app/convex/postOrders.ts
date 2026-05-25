import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listForUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return [];
    const orders = await ctx.db.query("postOrders").collect();
    const completions = await ctx.db.query("postOrderCompletions").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const siteIds = new Set(assignments.map((assignment) => assignment.siteId));
    const visibleCheckpointIds = new Set(
      checkpoints
        .filter((checkpoint) => checkpoint.siteId && siteIds.has(checkpoint.siteId))
        .map((checkpoint) => checkpoint._id),
    );

    return orders
      .filter((order) => {
        if (user.role === "admin") return true;
        if (user.role === "main_account") {
          const checkpoint = checkpoints.find((item) => item._id === order.checkpointId);
          return checkpoint?.clientId === user.clientId;
        }
        return (
          (!order.assignedUserId || order.assignedUserId === args.userId) &&
          (!order.checkpointId || visibleCheckpointIds.has(order.checkpointId))
        );
      })
      .map((order) => {
        const latestCompletion = completions
          .filter(
            (completion) =>
              completion.postOrderId === order._id && completion.userId === args.userId,
          )
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        const checkpoint = checkpoints.find((item) => item._id === order.checkpointId);
        return {
          id: order.legacyId ?? order._id,
          title: order.title,
          summary: order.summary,
          instructions: order.instructions,
          checkpointId: checkpoint ? checkpoint.legacyId ?? checkpoint._id : null,
          checkpointName: checkpoint?.name ?? null,
          priority: order.priority,
          active: order.active,
          requiresAcknowledgement: order.requiresAcknowledgement,
          requiresPhotoProof: order.requiresPhotoProof,
          latestCompletion: latestCompletion
            ? {
                id: latestCompletion.legacyId ?? latestCompletion._id,
                status: latestCompletion.status,
                reviewStatus: latestCompletion.reviewStatus,
                completedAt: latestCompletion.completedAt
                  ? new Date(latestCompletion.completedAt).toISOString()
                  : null,
                acknowledgedAt: latestCompletion.acknowledgedAt
                  ? new Date(latestCompletion.acknowledgedAt).toISOString()
                  : null,
                proofPhotoUrl: latestCompletion.proofPhotoUrl || null,
                proofNote: latestCompletion.proofNote || null,
              }
            : null,
        };
      });
  },
});

export const acknowledge = mutation({
  args: {
    orderId: v.id("postOrders"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const activeShift = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Post order not found");
    const id = await ctx.db.insert("postOrderCompletions", {
      postOrderId: args.orderId,
      userId: args.userId,
      shiftId: activeShift?._id,
      checkpointId: order.checkpointId,
      status: "acknowledged",
      acknowledgedAt: now,
      proofPhotoUrl: "",
      proofNote: "",
      reviewStatus: "pending",
      reviewNote: "",
      createdAt: now,
    });
    return {
      id,
      status: "acknowledged",
      reviewStatus: "pending",
      completedAt: null,
      acknowledgedAt: new Date(now).toISOString(),
      proofPhotoUrl: null,
      proofNote: null,
    };
  },
});

export const complete = mutation({
  args: {
    orderId: v.id("postOrders"),
    userId: v.id("users"),
    proofNote: v.optional(v.string()),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    proofPhotoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const activeShift = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Post order not found");
    const id = await ctx.db.insert("postOrderCompletions", {
      postOrderId: args.orderId,
      userId: args.userId,
      shiftId: activeShift?._id,
      checkpointId: order.checkpointId,
      status: "completed",
      completedAt: now,
      proofPhotoUrl: args.proofPhotoUrl ?? "",
      proofNote: args.proofNote ?? "",
      proofGpsLatitude: args.gpsLatitude,
      proofGpsLongitude: args.gpsLongitude,
      reviewStatus: "pending",
      reviewNote: "",
      createdAt: now,
    });
    return {
      id,
      status: "completed",
      reviewStatus: "pending",
      completedAt: new Date(now).toISOString(),
      acknowledgedAt: null,
      proofPhotoUrl: args.proofPhotoUrl ?? null,
      proofNote: args.proofNote ?? null,
    };
  },
});

export const resolveId = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("postOrders").collect();
    return (
      all.find((item) => item.legacyId === args.id || item._id === args.id)?._id ??
      null
    );
  },
});
