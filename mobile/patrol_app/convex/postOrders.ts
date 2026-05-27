import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listAll = query({
  args: { clientId: v.optional(v.id("clients")), active: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let orders = await ctx.db.query("postOrders").order("desc").collect();
    if (args.active !== undefined) orders = orders.filter(o => o.active === args.active);
    if (args.clientId) {
      const cps = await ctx.db.query("checkpoints").collect();
      const clientCpIds = new Set(cps.filter(cp => cp.clientId === args.clientId).map(cp => cp._id));
      orders = orders.filter(o => o.checkpointId && clientCpIds.has(o.checkpointId));
    }
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const completions = await ctx.db.query("postOrderCompletions").collect();
    return orders.map(o => ({
      id: o.legacyId ?? o._id, title: o.title, summary: o.summary,
      instructions: o.instructions,
      checkpointId: o.checkpointId,
      checkpointName: checkpoints.find(c => c._id === o.checkpointId)?.name ?? null,
      assignedUserId: o.assignedUserId, priority: o.priority, active: o.active,
      requiresAcknowledgement: o.requiresAcknowledgement,
      requiresPhotoProof: o.requiresPhotoProof, createdBy: o.createdBy,
      completions: completions.filter(c => c.postOrderId === o._id),
      createdAt: new Date(o.createdAt).toISOString(),
    }));
  },
});

export const create = mutation({
  args: {
    title: v.string(), summary: v.string(), instructions: v.string(),
    checkpointId: v.optional(v.id("checkpoints")),
    assignedUserId: v.optional(v.id("users")), assignedRole: v.string(),
    priority: v.string(), active: v.boolean(),
    requiresAcknowledgement: v.boolean(), requiresPhotoProof: v.boolean(),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("postOrders", { ...args, createdAt: Date.now() });
    return { id, ...args, createdAt: new Date().toISOString() };
  },
});

export const listCompletions = query({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let completions = await ctx.db.query("postOrderCompletions").order("desc").collect();
    if (args.clientId) {
      const cps = await ctx.db.query("checkpoints").collect();
      const clientCpIds = new Set(cps.filter(cp => cp.clientId === args.clientId).map(cp => cp._id));
      const orders = await ctx.db.query("postOrders").collect();
      const orderIds = new Set(orders.filter(o => clientCpIds.has(o.checkpointId)).map(o => o._id));
      completions = completions.filter(c => orderIds.has(c.postOrderId));
    }
    const users = await ctx.db.query("users").collect();
    const orders = await ctx.db.query("postOrders").collect();
    return completions.map(c => ({
      id: c.legacyId ?? c._id, postOrderId: c.postOrderId,
      orderTitle: orders.find(o => o._id === c.postOrderId)?.title ?? "",
      userId: c.userId,
      userName: users.find(u => u._id === c.userId)?.name ?? "",
      status: c.status, reviewStatus: c.reviewStatus,
      completedAt: c.completedAt ? new Date(c.completedAt).toISOString() : null,
      acknowledgedAt: c.acknowledgedAt ? new Date(c.acknowledgedAt).toISOString() : null,
      proofPhotoUrl: c.proofPhotoUrl || null, proofNote: c.proofNote,
      createdAt: new Date(c.createdAt).toISOString(),
    }));
  },
});

export const reviewCompletion = mutation({
  args: {
    completionId: v.id("postOrderCompletions"),
    reviewerId: v.id("users"),
    reviewStatus: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.completionId, {
      reviewStatus: args.reviewStatus,
      reviewNote: args.reviewNote ?? "",
      reviewedBy: args.reviewerId,
      reviewedAt: Date.now(),
    });
    return await ctx.db.get(args.completionId);
  },
});

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
