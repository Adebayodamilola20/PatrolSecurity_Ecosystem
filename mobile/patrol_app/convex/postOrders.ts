import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

export const listAll = internalQuery({
  args: {
    clientId: v.optional(v.id("clients")),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let orders = await ctx.db.query("postOrders").order("desc").collect();
    if (args.active !== undefined)
      orders = orders.filter((o) => o.active === args.active);
    if (args.clientId) {
      const cps = await ctx.db.query("checkpoints").collect();
      const clientCpIds = new Set(
        cps.filter((cp) => cp.clientId === args.clientId).map((cp) => cp._id),
      );
      orders = orders.filter(
        (o) =>
          o.clientId === args.clientId ||
          (o.checkpointId && clientCpIds.has(o.checkpointId)),
      );
    }
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const sites = await ctx.db.query("sites").collect();
    const completions = await ctx.db.query("postOrderCompletions").collect();
    return orders.map((o) => ({
      id: o.legacyId ?? o._id,
      title: o.title,
      summary: o.summary,
      instructions: o.instructions,
      checkpointId: o.checkpointId,
      checkpointName:
        checkpoints.find((c) => c._id === o.checkpointId)?.name ?? null,
      siteId: o.siteId ?? null,
      siteName: sites.find((s) => s._id === o.siteId)?.name ?? null,
      assignedUserId: o.assignedUserId,
      priority: o.priority,
      active: o.active,
      requiresAcknowledgement: o.requiresAcknowledgement,
      requiresPhotoProof: o.requiresPhotoProof,
      createdBy: o.createdBy,
      completions: completions.filter((c) => c.postOrderId === o._id),
      createdAt: new Date(o.createdAt).toISOString(),
    }));
  },
});

/**
 * Resolve and validate the Client → Location → Sub-location chain.
 *
 * The form loads sub-locations for the chosen location, so in normal use the
 * pair always agrees. The pair arrives as two ids on a request, though, and a
 * request is not the form: a sub-location from one client attached to another
 * client's location would produce an order that appears on the wrong site's
 * page and reaches the wrong guards. Checked here so both create and update
 * get it, rather than in the route where only one of them would.
 */
async function resolveScope(
  ctx: { db: any },
  checkpointId?: Id<"checkpoints"> | null,
  siteId?: Id<"sites"> | null,
) {
  const checkpoint = checkpointId
    ? ((await ctx.db.get(checkpointId)) as Doc<"checkpoints"> | null)
    : null;
  if (checkpointId && !checkpoint) throw new Error("Sub-location not found");
  const site = siteId ? ((await ctx.db.get(siteId)) as Doc<"sites"> | null) : null;
  if (siteId && !site) throw new Error("Location not found");

  if (checkpoint && site && checkpoint.siteId !== site._id) {
    throw new Error(
      `"${checkpoint.name}" is not a sub-location of "${site.name}"`,
    );
  }
  if (
    checkpoint?.clientId &&
    site?.clientId &&
    checkpoint.clientId !== site.clientId
  ) {
    throw new Error("That sub-location belongs to a different client");
  }

  const resolvedSite = checkpoint?.siteId
    ? ((await ctx.db.get(checkpoint.siteId)) as Doc<"sites"> | null)
    : site;
  return {
    checkpoint,
    siteId: resolvedSite?._id,
    clientId: checkpoint?.clientId ?? resolvedSite?.clientId,
  };
}

/**
 * Create a post order.
 *
 * The form behind this asked for a title, a short summary, a priority, an
 * active flag and a proof-photo flag before anyone could write the one thing
 * that matters — the instruction the guard reads at the gate. Those fields
 * are now optional: the columns stay so existing orders keep rendering, but
 * nothing has to supply them. A missing title falls back to the point the
 * order belongs to, which is what staff called them anyway ("Front Gate").
 */
export const create = internalMutation({
  args: {
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    instructions: v.string(),
    // Scope: a sub-location (checkpointId), a whole location (siteId), or
    // neither (general duty). A checkpoint implies its parent site.
    checkpointId: v.optional(v.id("checkpoints")),
    siteId: v.optional(v.id("sites")),
    assignedUserId: v.optional(v.id("users")),
    assignedUserIds: v.optional(v.array(v.id("users"))),
    supervisorUserIds: v.optional(v.array(v.id("users"))),
    assignedRole: v.optional(v.union(v.literal("admin"), v.literal("main_account"), v.literal("supervisor"), v.literal("guard"))),
    priority: v.optional(v.string()),
    active: v.optional(v.boolean()),
    requiresAcknowledgement: v.optional(v.boolean()),
    requiresPhotoProof: v.optional(v.boolean()),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const creator = await ctx.db.get(args.createdBy);
    const scope = await resolveScope(ctx, args.checkpointId, args.siteId);
    const checkpoint = scope.checkpoint;
    const siteId = scope.siteId;
    const site = siteId ? await ctx.db.get(siteId) : null;
    // Normalize the guard list: de-dupe, drop blanks. A single legacy
    // assignedUserId is folded in so both shapes stay consistent.
    const guardIds = Array.from(
      new Set([
        ...(args.assignedUserIds ?? []),
        ...(args.assignedUserId ? [args.assignedUserId] : []),
      ]),
    );
    const supervisorIds = Array.from(new Set(args.supervisorUserIds ?? []));
    const title =
      args.title?.trim() ||
      checkpoint?.name ||
      site?.name ||
      "Post order";
    const id = await ctx.db.insert("postOrders", {
      title,
      summary: args.summary ?? "",
      instructions: args.instructions,
      checkpointId: args.checkpointId,
      assignedUserId: guardIds[0],
      assignedUserIds: guardIds,
      supervisorUserIds: supervisorIds,
      assignedRole: args.assignedRole ?? "guard",
      priority: args.priority ?? "normal",
      // An order nobody asked to deactivate is on duty. The old form made
      // this a checkbox staff had to remember to tick.
      active: args.active !== false,
      // The whole point is that the guard reads it at the gate, so it pops up
      // on the scan unless someone deliberately says otherwise.
      requiresAcknowledgement: args.requiresAcknowledgement !== false,
      requiresPhotoProof: args.requiresPhotoProof === true,
      clientId: scope.clientId ?? creator?.clientId,
      siteId,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });
    return {
      id,
      title,
      instructions: args.instructions,
      checkpointId: args.checkpointId,
      assignedUserIds: guardIds,
      supervisorUserIds: supervisorIds,
      siteId,
      createdAt: new Date().toISOString(),
    };
  },
});

export const update = internalMutation({
  args: {
    orderId: v.id("postOrders"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    instructions: v.optional(v.string()),
    priority: v.optional(v.string()),
    active: v.optional(v.boolean()),
    checkpointId: v.optional(v.union(v.id("checkpoints"), v.null())),
    siteId: v.optional(v.union(v.id("sites"), v.null())),
    assignedUserIds: v.optional(v.array(v.id("users"))),
    supervisorUserIds: v.optional(v.array(v.id("users"))),
    assignedRole: v.optional(v.union(v.literal("admin"), v.literal("main_account"), v.literal("supervisor"), v.literal("guard"))),
    requiresAcknowledgement: v.optional(v.boolean()),
    requiresPhotoProof: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orderId, assignedUserIds, supervisorUserIds, checkpointId, siteId, ...rest } = args;
    const existing = await ctx.db.get(orderId);
    if (!existing) throw new Error("Post order not found");
    const clean: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    // Guard list edits keep the legacy single field in sync.
    if (assignedUserIds !== undefined) {
      const guardIds = Array.from(new Set(assignedUserIds));
      clean.assignedUserIds = guardIds;
      clean.assignedUserId = guardIds[0];
    }
    if (supervisorUserIds !== undefined) {
      clean.supervisorUserIds = Array.from(new Set(supervisorUserIds));
    }

    // Moving a post order goes through the same Client → Location →
    // Sub-location check as creating one. Patching the two ids independently
    // would let an edit land a sub-location under a location it has nothing
    // to do with — the one shape create already refuses.
    if (checkpointId !== undefined || siteId !== undefined) {
      const nextCheckpoint =
        checkpointId === undefined ? existing.checkpointId : checkpointId;
      const nextSite = siteId === undefined ? existing.siteId : siteId;
      const scope = await resolveScope(ctx, nextCheckpoint, nextSite);
      clean.checkpointId = nextCheckpoint ?? undefined;
      clean.siteId = scope.siteId;
      clean.clientId = scope.clientId;
    }

    await ctx.db.patch(orderId, clean as any);
    return await ctx.db.get(orderId);
  },
});

// Hard-delete a post order and every acknowledgement/completion row tied to it,
// so "clear" leaves nothing dangling behind.
export const remove = internalMutation({
  args: { orderId: v.id("postOrders") },
  handler: async (ctx, args) => {
    const completions = await ctx.db
      .query("postOrderCompletions")
      .collect();
    for (const c of completions) {
      if (c.postOrderId === args.orderId) await ctx.db.delete(c._id);
    }
    await ctx.db.delete(args.orderId);
    return { id: args.orderId, deleted: true };
  },
});

// Admin/management listing: everything the staff Post Orders page needs that the
// guard-facing listForUser strips — real created date, the assigned guards by
// name, and the full acknowledgement/completion history per order.
export const listForAdmin = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let orders = await ctx.db.query("postOrders").order("desc").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    if (args.clientId) {
      const clientCpIds = new Set(
        checkpoints
          .filter((cp) => cp.clientId === args.clientId)
          .map((cp) => cp._id),
      );
      orders = orders.filter(
        (o) =>
          o.clientId === args.clientId ||
          (o.checkpointId && clientCpIds.has(o.checkpointId)),
      );
    }
    const sites = await ctx.db.query("sites").collect();
    const users = await ctx.db.query("users").collect();
    const completions = await ctx.db.query("postOrderCompletions").collect();
    const userName = (id: any) => users.find((u) => u._id === id)?.name ?? null;
    return orders.map((o) => {
      const guardIds =
        o.assignedUserIds && o.assignedUserIds.length
          ? o.assignedUserIds
          : o.assignedUserId
            ? [o.assignedUserId]
            : [];
      const assignedGuards = guardIds.map((id) => ({
        id: id as unknown as string,
        name: userName(id) ?? "Unknown",
      }));
      const history = completions
        .filter((c) => c.postOrderId === o._id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((c) => ({
          id: c.legacyId ?? c._id,
          userId: c.userId as unknown as string,
          userName: userName(c.userId) ?? "Unknown",
          status: c.status,
          reviewStatus: c.reviewStatus,
          acknowledgedAt: c.acknowledgedAt
            ? new Date(c.acknowledgedAt).toISOString()
            : null,
          completedAt: c.completedAt
            ? new Date(c.completedAt).toISOString()
            : null,
          proofPhotoUrl: c.proofPhotoStorageId || null,
          proofNote: c.proofNote || null,
          createdAt: new Date(c.createdAt).toISOString(),
        }));
      return {
        id: o.legacyId ?? o._id,
        title: o.title,
        summary: o.summary,
        instructions: o.instructions,
        checkpointId: o.checkpointId ?? null,
        checkpointName:
          checkpoints.find((c) => c._id === o.checkpointId)?.name ?? null,
        siteId: o.siteId ?? null,
        siteName: sites.find((s) => s._id === o.siteId)?.name ?? null,
        assignedUserId: o.assignedUserId ?? null,
        assignedUserName: userName(o.assignedUserId),
        assignedUserIds: guardIds as unknown as string[],
        assignedGuards,
        // Supervisors travel separately so the edit form can load them back
        // into their own picker rather than merging everyone into one list.
        supervisorUserIds: (o.supervisorUserIds ?? []) as unknown as string[],
        supervisors: (o.supervisorUserIds ?? []).map((id) => ({
          id: id as unknown as string,
          name: userName(id) ?? "Unknown",
        })),
        assignedRole: o.assignedRole,
        priority: o.priority,
        active: o.active,
        requiresAcknowledgement: o.requiresAcknowledgement,
        requiresPhotoProof: o.requiresPhotoProof,
        createdBy: o.createdBy as unknown as string,
        createdByName: userName(o.createdBy),
        createdAt: new Date(o.createdAt).toISOString(),
        acknowledgementHistory: history,
      };
    });
  },
});

export const resolveCompletionId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("postOrderCompletions")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) return byLegacyId._id;
    const all = await ctx.db.query("postOrderCompletions").collect();
    return all.find(c => c._id === args.id)?._id ?? null;
  },
});

export const listCompletions = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let completions = await ctx.db
      .query("postOrderCompletions")
      .order("desc")
      .collect();
    if (args.clientId) {
      const cps = await ctx.db.query("checkpoints").collect();
      const clientCpIds = new Set(
        cps.filter((cp) => cp.clientId === args.clientId).map((cp) => cp._id),
      );
      const orders = await ctx.db.query("postOrders").collect();
      const orderIds = new Set(
        orders
          .filter(
            (o) =>
              o.clientId === args.clientId || (o.checkpointId && clientCpIds.has(o.checkpointId)),
          )
          .map((o) => o._id),
      );
      completions = completions.filter(
        (c) => c.clientId === args.clientId || orderIds.has(c.postOrderId),
      );
    }
    const users = await ctx.db.query("users").collect();
    const orders = await ctx.db.query("postOrders").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    return completions.map((c) => ({
      id: c.legacyId ?? c._id,
      postOrderId: c.postOrderId,
      postOrderTitle: orders.find((o) => o._id === c.postOrderId)?.title ?? "",
      userId: c.userId,
      userName: users.find((u) => u._id === c.userId)?.name ?? "",
      checkpointId: c.checkpointId ?? null,
      checkpointName: c.checkpointId
        ? (checkpoints.find((cp) => cp._id === c.checkpointId)?.name ?? null)
        : null,
      status: c.status,
      reviewStatus: c.reviewStatus,
      completedAt: c.completedAt ? new Date(c.completedAt).toISOString() : null,
      acknowledgedAt: c.acknowledgedAt
        ? new Date(c.acknowledgedAt).toISOString()
        : null,
      proofPhotoUrl: c.proofPhotoStorageId || null,
      proofNote: c.proofNote,
      createdAt: new Date(c.createdAt).toISOString(),
    }));
  },
});

export const reviewCompletion = internalMutation({
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

export const listForUser = internalQuery({
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
        .filter(
          (checkpoint) => checkpoint.siteId && siteIds.has(checkpoint.siteId),
        )
        .map((checkpoint) => checkpoint._id),
    );

    const sites = await ctx.db.query("sites").collect();

    // A sub-location's post order is the instruction for standing at that
    // point, so it is revealed by arriving there and nowhere else: the guard
    // must have a GPS-verified scan of that exact QR on the shift they are
    // currently working. A failed scan writes no row, so it reveals nothing.
    // Clocking out ends the shift and closes the orders with it.
    const activeShift = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
    const unlockedCheckpointIds = new Set<string>();
    if (activeShift) {
      const shiftScans = await ctx.db
        .query("scans")
        .withIndex("by_officerId_scannedAt", (q) =>
          q.eq("officerId", args.userId).gte("scannedAt", activeShift.clockIn),
        )
        .collect();
      for (const scan of shiftScans) {
        if (scan.gpsValid) unlockedCheckpointIds.add(scan.checkpointId);
      }
    }

    return orders
      .filter((order) => {
        if (user.role === "admin") return true;
        if (user.role === "main_account") {
          return order.clientId === user.clientId;
        }
        // Explicit assignment (guards, supervisors, or the legacy single
        // field). An order with a named list only reaches those people; an
        // empty list is open duty.
        const namedIds = [
          ...(order.assignedUserIds ?? []),
          ...(order.supervisorUserIds ?? []),
          ...(order.assignedUserId ? [order.assignedUserId] : []),
        ];
        if (namedIds.length && !namedIds.includes(args.userId)) {
          return false;
        }
        // Scoped orders only reach guards posted there: a sub-location order
        // needs its checkpoint's site assigned, a location order needs the
        // site itself. Unscoped orders are general duties for everyone.
        if (order.checkpointId) {
          if (!visibleCheckpointIds.has(order.checkpointId)) return false;
          // ...and only once the guard has actually verified they are there.
          return unlockedCheckpointIds.has(order.checkpointId);
        }
        if (order.siteId) return siteIds.has(order.siteId);
        return true;
      })
      .map((order) => {
        const latestCompletion = completions
          .filter(
            (completion) =>
              completion.postOrderId === order._id &&
              completion.userId === args.userId,
          )
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        const checkpoint = checkpoints.find(
          (item) => item._id === order.checkpointId,
        );
        return {
          id: order.legacyId ?? order._id,
          title: order.title,
          summary: order.summary,
          instructions: order.instructions,
          checkpointId: checkpoint
            ? (checkpoint.legacyId ?? checkpoint._id)
            : null,
          checkpointName: checkpoint?.name ?? null,
          siteId: order.siteId ?? null,
          siteName: sites.find((s) => s._id === order.siteId)?.name ?? null,
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
                proofPhotoUrl: latestCompletion.proofPhotoStorageId || null,
                proofNote: latestCompletion.proofNote || null,
              }
            : null,
        };
      });
  },
});

/**
 * May this user act on this post order at all?
 *
 * Both `acknowledge` and `complete` took an orderId and wrote, with no check of
 * any kind. The completion row is stamped with the order's clientId and siteId,
 * so an unchecked write lands a "this standing order was carried out" record —
 * with a proof note, a photo and GPS — inside another company's compliance
 * history, signed by a guard who has never worked for them. That is a forged
 * record in the one place a security operator cannot afford one.
 *
 * Staff stay unscoped, as everywhere else. A guard must be posted to the
 * order's location, or named on the order, or be working under the tenant when
 * the order carries no location of its own.
 */
async function mayActOnOrder(
  ctx: any,
  order: Doc<"postOrders">,
  userId: Id<"users">,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;
  if (user.role === "admin" || user.role === "supervisor") return true;
  if (user.role === "main_account") {
    return !!user.clientId && order.clientId === user.clientId;
  }
  // Named on the order, whatever the scope says.
  if (order.assignedUserId && order.assignedUserId === userId) return true;
  if (order.assignedUserIds?.some((id) => id === userId)) return true;
  if (order.supervisorUserIds?.some((id) => id === userId)) return true;

  const assignments = await ctx.db
    .query("userSiteAssignments")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();
  if (order.siteId) {
    return assignments.some((a: any) => a.siteId === order.siteId);
  }
  if (order.clientId) {
    for (const assignment of assignments) {
      if (assignment.clientId === order.clientId) return true;
      const site = await ctx.db.get(assignment.siteId);
      if (site?.clientId === order.clientId) return true;
    }
  }
  // No location and no tenant: nothing ties it to this guard.
  return false;
}

export const acknowledge = internalMutation({
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
    if (!(await mayActOnOrder(ctx, order, args.userId))) {
      throw new Error("This post order is not yours to acknowledge");
    }
    const user = await ctx.db.get(args.userId);
    const id = await ctx.db.insert("postOrderCompletions", {
      clientId: order.clientId,
      siteId: order.siteId,
      postOrderId: args.orderId,
      userId: args.userId,
      shiftId: activeShift?._id,
      checkpointId: order.checkpointId,
      status: "acknowledged",
      acknowledgedAt: now,
      proofNote: "",
      reviewStatus: "pending",
      reviewNote: "",
      createdAt: now,
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: order.clientId,
      siteId: order.siteId,
      checkpointId: order.checkpointId,
      officerId: args.userId,
      activityType: "post_order_ack",
      sourceTable: "postOrderCompletions",
      sourceId: id,
      activityLabel: `Post order acknowledged: ${order.title}`,
      occurredAt: now,
    });
    await ctx.runMutation(internal.audit.record, {
      action: "post_order.acknowledged",
      actorId: args.userId,
      actorRole: user?.role ?? "guard",
      targetType: "post_order",
      targetId: args.orderId,
      details: `Acknowledged post order: ${order.title}`,
      clientId: order.clientId,
      siteId: order.siteId,
      success: true,
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

export const complete = internalMutation({
  args: {
    orderId: v.id("postOrders"),
    userId: v.id("users"),
    proofNote: v.optional(v.string()),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    proofPhotoStorageId: v.optional(v.string()),
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
    if (!(await mayActOnOrder(ctx, order, args.userId))) {
      throw new Error("This post order is not yours to complete");
    }
    const id = await ctx.db.insert("postOrderCompletions", {
      clientId: order.clientId,
      siteId: order.siteId,
      postOrderId: args.orderId,
      userId: args.userId,
      shiftId: activeShift?._id,
      checkpointId: order.checkpointId,
      status: "completed",
      completedAt: now,
      proofPhotoStorageId: args.proofPhotoStorageId,
      proofNote: args.proofNote ?? "",
      proofGpsLatitude: args.gpsLatitude,
      proofGpsLongitude: args.gpsLongitude,
      reviewStatus: "pending",
      reviewNote: "",
      createdAt: now,
    });
    const _user = await ctx.db.get(args.userId);
    await ctx.runMutation(internal.activity.record, {
      clientId: order.clientId,
      siteId: order.siteId,
      checkpointId: order.checkpointId,
      officerId: args.userId,
      activityType: "post_order_ack",
      sourceTable: "postOrderCompletions",
      sourceId: id,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      activityLabel: `Post order completed: ${order.title}`,
      occurredAt: now,
    });
    await ctx.runMutation(internal.audit.record, {
      action: "post_order.completed",
      actorId: args.userId,
      actorRole: _user?.role ?? "guard",
      targetType: "post_order",
      targetId: args.orderId,
      details: `Completed post order: ${order.title}`,
      clientId: order.clientId,
      siteId: order.siteId,
      success: true,
    });
    return {
      id,
      status: "completed",
      reviewStatus: "pending",
      completedAt: new Date(now).toISOString(),
      acknowledgedAt: null,
      proofPhotoUrl: args.proofPhotoStorageId ?? null,
      proofNote: args.proofNote ?? null,
    };
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    // A Convex id is resolvable directly; only a legacy id needs the index.
    // Reading the whole table to answer "does this id exist" was the previous
    // shape, on a path every post-order edit goes through.
    const normalized = ctx.db.normalizeId("postOrders", args.id);
    if (normalized) {
      return (await ctx.db.get(normalized)) ? normalized : null;
    }
    const byLegacyId = await ctx.db
      .query("postOrders")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .first();
    return byLegacyId?._id ?? null;
  },
});
