import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isAssignedToSite, isAssignedUnderClient } from "./lib/authHelpers";
import { rowInScope } from "./lib/scope";

const handoverStatus = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("closed"),
);

// [tenant-isolation] Who may take over a post.
//
// A handover names the guard going off duty and the one relieving them, so
// accepting one is only ever the incoming guard's action. Three things have to
// hold: the post is still open, it was not passed to somebody else by name, and
// the guard is actually assigned there. Site assignment is the load-bearing
// check — guards work for the security company rather than for one client, so
// most of them carry no clientId at all and the company field alone would let
// a guard in Lagos accept a handover in Abuja for a different customer.
//
// Returns null when allowed, or the reason it is refused. The list of pending
// handovers and the accept mutation both go through here so a guard is never
// shown a post they would then be refused.
export async function handoverRefusalReason(
  ctx: QueryCtx,
  handover: Doc<"handovers">,
  actor: {
    userId: Id<"users">;
    role?: string;
    clientId?: Id<"clients"> | null;
  },
): Promise<string | null> {
  if (actor.role === "admin" || actor.role === "supervisor") return null;
  if (handover.status !== "pending") {
    return "This handover has already been accepted or closed";
  }
  if (handover.toUserId && handover.toUserId !== actor.userId) {
    return "This handover was passed to another guard";
  }
  if (handover.clientId && actor.clientId && handover.clientId !== actor.clientId) {
    return "This handover belongs to another company";
  }
  if (handover.siteId && !(await isAssignedToSite(ctx, actor.userId, handover.siteId))) {
    return "You are not posted to this location";
  }
  return null;
}

export const listAll = internalQuery({
  args: {
    clientId: v.optional(v.id("clients")),
    siteIds: v.optional(v.array(v.id("sites"))),
    siteClientIds: v.optional(v.array(v.id("clients"))),
    /**
     * The guard reading the list. A handover they are personally party to
     * stays visible even when it carries no site — losing sight of your own
     * shift hand-off would break the feature the app relies on.
     */
    participantId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let handovers = await ctx.db.query("handovers").order("desc").collect();
    if (args.siteIds) {
      handovers = handovers.filter(
        (h) =>
          rowInScope(args, h) ||
          (!!args.participantId &&
            (h.fromUserId === args.participantId ||
              h.toUserId === args.participantId)),
      );
    }
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

// [authz] Closing or re-opening a handover is a control-room action on a
// chain-of-custody record. The actor travels with the request and is checked
// here as well as at the route, so a future caller that skips the route cannot
// quietly rewrite whose shift ended where.
export const updateStatus = internalMutation({
  args: {
    handoverId: v.id("handovers"),
    status: handoverStatus,
    actorRole: v.string(),
    actorClientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const handover = await ctx.db.get(args.handoverId);
    if (!handover) throw new Error("Handover not found");
    // Staff are unscoped by design (see the supervisor decision, 2026-08-08).
    if (args.actorRole !== "admin" && args.actorRole !== "supervisor") {
      if (!args.actorClientId || handover.clientId !== args.actorClientId) {
        throw new Error("Access denied: cannot change this handover's status");
      }
    }
    await ctx.db.patch(args.handoverId, { status: args.status });
    return await ctx.db.get(args.handoverId);
  },
});

export const listPendingForUser = internalQuery({
  args: {
    userId: v.id("users"),
    role: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const handovers = await ctx.db.query("handovers").collect();
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    // [tenant-isolation] Same rule as accepting one. This used to return every
    // pending handover in the database, so a guard's app listed other
    // companies' shift notes — summary text, open issues, site labels — for
    // posts they could never work.
    const visible: Doc<"handovers">[] = [];
    for (const handover of handovers) {
      if (handover.status !== "pending") continue;
      const refusal = await handoverRefusalReason(ctx, handover, {
        userId: args.userId,
        role: args.role,
        clientId: args.clientId ?? null,
      });
      if (!refusal) visible.push(handover);
    }
    return visible
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
    // [tenant-isolation] The checkpoint id arrives in the request body and it
    // is what decides the company and location this handover is filed under.
    // A guard who swapped it could post a shift note into another customer's
    // records and stand in their handover list as the outgoing officer, so the
    // same rule the scan path enforces applies: you may only file where you
    // are posted. Without a checkpoint the scope comes from the guard's own
    // shift and there is nothing to forge.
    if (checkpoint && user?.role !== "admin" && user?.role !== "supervisor") {
      const posted = checkpoint.siteId
        ? await isAssignedToSite(ctx, args.userId, checkpoint.siteId)
        : checkpoint.clientId
          ? await isAssignedUnderClient(ctx, args.userId, checkpoint.clientId)
          : true;
      if (!posted) {
        throw new Error("Access denied: you are not posted to this location");
      }
    }
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
    actorRole: v.optional(v.string()),
    actorClientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    // [authz] Re-checked here even though the route already refused: this
    // mutation writes toUserId, which is the record of who took the post. Left
    // unchecked it let any signed-in guard put their own name on any handover
    // in the database, at any site, for any customer.
    const existing = await ctx.db.get(args.handoverId);
    if (!existing) throw new Error("Handover not found");
    const refusal = await handoverRefusalReason(ctx, existing, {
      userId: args.userId,
      role: args.actorRole,
      clientId: args.actorClientId ?? null,
    });
    if (refusal) throw new Error(`Access denied: ${refusal}`);
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

// Resolves a caller-supplied id (legacy or Convex) to the row, returning the
// fields the route needs to answer 403 rather than let the mutation throw a
// 500. The mutation re-checks regardless.
export const resolveForAuth = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("handovers")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    const normalized = ctx.db.normalizeId("handovers", args.id);
    const handover =
      byLegacyId ?? (normalized ? await ctx.db.get(normalized) : null);
    if (!handover) return null;
    return {
      id: handover._id,
      status: handover.status,
      clientId: handover.clientId ?? null,
      siteId: handover.siteId ?? null,
      fromUserId: handover.fromUserId,
      toUserId: handover.toUserId ?? null,
    };
  },
});
