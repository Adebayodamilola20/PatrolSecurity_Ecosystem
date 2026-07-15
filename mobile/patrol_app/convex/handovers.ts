import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const listAll = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let handovers = await ctx.db.query("handovers").order("desc").collect();
    if (args.clientId) {
      const clientUsers = await ctx.db.query("users").collect();
      const clientUserIds = new Set(
        clientUsers
          .filter((u) => u.clientId === args.clientId)
          .map((u) => u._id),
      );
      handovers = handovers.filter(
        (h) =>
          h.clientId === args.clientId ||
          clientUserIds.has(h.fromUserId) ||
          (h.toUserId && clientUserIds.has(h.toUserId)),
      );
    }
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    return handovers.map((h) => ({
      id: h.legacyId ?? h._id,
      summary: h.summary,
      status: h.status,
      checkpointName:
        checkpoints.find((c) => c._id === h.checkpointId)?.name ?? null,
      siteLabel: h.siteLabel,
      fromUserName: users.find((u) => u._id === h.fromUserId)?.name ?? null,
      toUserName: users.find((u) => u._id === h.toUserId)?.name ?? null,
      openIssues: h.openIssues,
      equipmentStatus: h.equipmentStatus,
      photoUrl: h.photoStorageId || null,
      createdAt: new Date(h.createdAt).toISOString(),
      acceptedAt: h.acceptedAt ? new Date(h.acceptedAt).toISOString() : null,
    }));
  },
});

export const updateStatus = internalMutation({
  args: { handoverId: v.id("handovers"), status: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.handoverId, { status: args.status as any });
    return await ctx.db.get(args.handoverId);
  },
});

export const listPendingForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const handovers = await ctx.db.query("handovers").collect();
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    return handovers
      .filter(
        (handover) =>
          handover.status === "pending" &&
          (!handover.toUserId || handover.toUserId === args.userId),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((handover) => ({
        id: handover.legacyId ?? handover._id,
        summary: handover.summary,
        status: handover.status,
        checkpointName:
          checkpoints.find(
            (checkpoint) => checkpoint._id === handover.checkpointId,
          )?.name ?? null,
        siteLabel: handover.siteLabel,
        fromUserName:
          users.find((user) => user._id === handover.fromUserId)?.name ?? null,
        toUserName:
          users.find((user) => user._id === handover.toUserId)?.name ?? null,
        openIssues: handover.openIssues,
        equipmentStatus: handover.equipmentStatus,
        photoUrl: handover.photoStorageId || null,
        createdAt: new Date(handover.createdAt).toISOString(),
      }));
  },
});

export const create = internalMutation({
  args: {
    userId: v.id("users"),
    summary: v.string(),
    openIssues: v.optional(v.string()),
    equipmentStatus: v.optional(v.string()),
    siteLabel: v.optional(v.string()),
    checkpointId: v.optional(v.id("checkpoints")),
    photoStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const activeShift = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
    const user = await ctx.db.get(args.userId);
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;
    const now = Date.now();
    const id = await ctx.db.insert("handovers", {
      clientId: checkpoint?.clientId ?? activeShift?.clientId ?? user?.clientId,
      siteId: checkpoint?.siteId ?? activeShift?.siteId,
      shiftId: activeShift?._id,
      checkpointId: args.checkpointId,
      siteLabel: args.siteLabel ?? activeShift?.siteLabel ?? "",
      fromUserId: args.userId,
      summary: args.summary,
      openIssues: args.openIssues ?? "",
      equipmentStatus: args.equipmentStatus ?? "",
      photoStorageId: args.photoStorageId,
      status: "pending",
      acceptedNote: "",
      createdAt: now,
    });
    return {
      id,
      summary: args.summary,
      status: "pending",
      checkpointName: checkpoint?.name ?? null,
      siteLabel: args.siteLabel ?? activeShift?.siteLabel ?? "",
      fromUserName: user?.name ?? null,
      toUserName: null,
      openIssues: args.openIssues ?? "",
      equipmentStatus: args.equipmentStatus ?? "",
      photoUrl: args.photoStorageId ?? null,
      createdAt: new Date(now).toISOString(),
    };
  },
});

export const accept = internalMutation({
  args: {
    handoverId: v.id("handovers"),
    userId: v.id("users"),
    acceptedNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.handoverId, {
      status: "accepted",
      toUserId: args.userId,
      acceptedNote: args.acceptedNote ?? "",
      acceptedAt: now,
    });
    const handover = await ctx.db.get(args.handoverId);
    const users = await ctx.db.query("users").collect();
    const checkpoint = handover?.checkpointId
      ? await ctx.db.get(handover.checkpointId)
      : null;
    return handover
      ? {
          id: handover.legacyId ?? handover._id,
          summary: handover.summary,
          status: "accepted",
          checkpointName: checkpoint?.name ?? null,
          siteLabel: handover.siteLabel,
          fromUserName:
            users.find((user) => user._id === handover.fromUserId)?.name ??
            null,
          toUserName:
            users.find((user) => user._id === args.userId)?.name ?? null,
          openIssues: handover.openIssues,
          equipmentStatus: handover.equipmentStatus,
          photoUrl: handover.photoStorageId || null,
          createdAt: new Date(handover.createdAt).toISOString(),
        }
      : null;
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("handovers").collect();
    return (
      all.find((item) => item.legacyId === args.id || item._id === args.id)
        ?._id ?? null
    );
  },
});
