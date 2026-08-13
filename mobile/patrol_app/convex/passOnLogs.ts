import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Whether one pass-on reaches one person.
 *
 * The old rule let a log with no checkpoint through to every guard in the
 * system — `!log.checkpointId || ...` — which was survivable while only staff
 * could write them and stops being survivable the moment a client can. A
 * guard now has to be named on it, or be posted at the place it was written
 * for, or at least work for the company that sent it.
 */
function reaches(
  log: {
    checkpointId?: unknown;
    siteId?: unknown;
    clientId?: unknown;
    recipientUserIds?: readonly string[];
    createdBy: string;
  },
  ctx: {
    user: { role: string; clientId?: unknown };
    userId: string;
    siteIds: Set<unknown>;
    userCheckpointIds: Set<unknown>;
    clientIds: Set<unknown>;
  },
): boolean {
  if (ctx.user.role === "admin" || ctx.user.role === "supervisor") return true;
  if (ctx.user.role === "main_account") {
    return !!ctx.user.clientId && log.clientId === ctx.user.clientId;
  }
  if (log.createdBy === ctx.userId) return true;
  // Named recipients: only those people, whatever the scope says.
  if (log.recipientUserIds?.length) {
    return log.recipientUserIds.includes(ctx.userId);
  }
  if (log.checkpointId) return ctx.userCheckpointIds.has(log.checkpointId);
  if (log.siteId) return ctx.siteIds.has(log.siteId);
  // No place at all: keep it inside the tenant that wrote it rather than
  // broadcasting it to every guard on the platform.
  if (log.clientId) return ctx.clientIds.has(log.clientId);
  return false;
}

export const listForUser = internalQuery({
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
        .filter(
          (checkpoint) => checkpoint.siteId && siteIds.has(checkpoint.siteId),
        )
        .map((checkpoint) => checkpoint._id),
    );
    const logs = await ctx.db.query("passOnLogs").order("desc").collect();
    const users = await ctx.db.query("users").collect();
    const sites = await ctx.db.query("sites").collect();
    const clients = await ctx.db.query("clients").collect();
    const clientIds = new Set(
      assignments.map((assignment) => assignment.clientId).filter(Boolean),
    );

    return logs
      .filter((log) => reaches(log, { user, userId: args.userId, siteIds, userCheckpointIds, clientIds }))
      .map((log) => ({
        id: log.legacyId ?? log._id,
        title: log.title,
        instruction: log.instruction,
        priority: log.priority,
        siteLabel:
          log.siteLabel ||
          sites.find((s) => s._id === log.siteId)?.name ||
          "",
        checkpointId: log.checkpointId ?? null,
        checkpointName:
          checkpoints.find((c) => c._id === log.checkpointId)?.name ?? null,
        siteId: log.siteId ?? null,
        siteName: sites.find((s) => s._id === log.siteId)?.name ?? null,
        // Who it is from, in the guard's terms: a client's instruction and a
        // control-room instruction are read very differently at 2am.
        clientName: clients.find((c) => c._id === log.clientId)?.name ?? null,
        requiresAcknowledgement: log.requiresAcknowledgement,
        createdBy: log.createdBy,
        createdByName:
          users.find((item) => item._id === log.createdBy)?.name ?? "",
        createdByRole:
          users.find((item) => item._id === log.createdBy)?.role ?? null,
        active: log.active,
        createdAt: new Date(log.createdAt).toISOString(),
      }));
  },
});

export const listPendingForUser = internalQuery({
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
        .filter(
          (checkpoint) => checkpoint.siteId && siteIds.has(checkpoint.siteId),
        )
        .map((checkpoint) => checkpoint._id),
    );
    const clientIds = new Set(
      assignments.map((assignment) => assignment.clientId).filter(Boolean),
    );
    const sites = await ctx.db.query("sites").collect();
    const clients = await ctx.db.query("clients").collect();

    return available
      .filter(
        (log) =>
          log.active &&
          !acked.has(log._id) &&
          reaches(log, { user, userId: args.userId, siteIds, userCheckpointIds, clientIds }),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((log) => ({
        id: log.legacyId ?? log._id,
        title: log.title,
        instruction: log.instruction,
        priority: log.priority,
        siteLabel:
          log.siteLabel || sites.find((s) => s._id === log.siteId)?.name || "",
        checkpointId: log.checkpointId ?? null,
        checkpointName:
          checkpoints.find((c) => c._id === log.checkpointId)?.name ?? null,
        siteId: log.siteId ?? null,
        siteName: sites.find((s) => s._id === log.siteId)?.name ?? null,
        clientName: clients.find((c) => c._id === log.clientId)?.name ?? null,
        requiresAcknowledgement: log.requiresAcknowledgement,
        createdBy: log.createdBy,
        createdByName:
          users.find((item) => item._id === log.createdBy)?.name ?? "",
        createdByRole:
          users.find((item) => item._id === log.createdBy)?.role ?? null,
        acknowledged: false,
        active: log.active,
        createdAt: new Date(log.createdAt).toISOString(),
      }));
  },
});

export const create = internalMutation({
  args: {
    title: v.string(),
    instruction: v.string(),
    priority: v.optional(v.string()),
    siteLabel: v.optional(v.string()),
    checkpointId: v.optional(v.id("checkpoints")),
    siteId: v.optional(v.id("sites")),
    recipientUserIds: v.optional(v.array(v.id("users"))),
    requiresAcknowledgement: v.optional(v.boolean()),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const creator = await ctx.db.get(args.createdBy);
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;
    const siteId = checkpoint?.siteId ?? args.siteId;
    const site = siteId ? await ctx.db.get(siteId) : null;

    // A client account may only address its own places. Without this a portal
    // login could post instructions onto another company's site by sending
    // its id — the route resolves ids, it does not own them.
    if (creator?.role === "main_account") {
      const owner = checkpoint?.clientId ?? site?.clientId;
      if (!creator.clientId || !owner || owner !== creator.clientId) {
        throw new Error("That location does not belong to your account");
      }
    }

    // Named recipients have to be people actually posted to this place,
    // for the same reason: a client picking guard ids by hand must not be
    // able to address a guard who works for someone else.
    let recipients = Array.from(new Set(args.recipientUserIds ?? []));
    if (recipients.length && siteId) {
      const posted = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
        .collect();
      const allowed = new Set(posted.map((a) => a.userId));
      recipients = recipients.filter((id) => allowed.has(id));
      if (!recipients.length) {
        throw new Error("None of those guards are posted to this location");
      }
    }

    const id = await ctx.db.insert("passOnLogs", {
      clientId: checkpoint?.clientId ?? site?.clientId ?? creator?.clientId,
      siteId,
      title: args.title,
      instruction: args.instruction,
      priority: args.priority ?? "normal",
      siteLabel: args.siteLabel || site?.name || "",
      checkpointId: args.checkpointId,
      recipientUserIds: recipients,
      requiresAcknowledgement: args.requiresAcknowledgement ?? false,
      createdBy: args.createdBy,
      active: true,
      createdAt: Date.now(),
    });
    return {
      id,
      title: args.title,
      instruction: args.instruction,
      priority: args.priority ?? "normal",
      siteLabel: args.siteLabel || site?.name || "",
      checkpointId: args.checkpointId ?? null,
      siteId: siteId ?? null,
      recipientUserIds: recipients,
      requiresAcknowledgement: args.requiresAcknowledgement ?? false,
      createdBy: args.createdBy,
      createdByName: creator?.name ?? "",
      active: true,
      createdAt: new Date().toISOString(),
    };
  },
});

export const acknowledge = internalMutation({
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
    const log = await ctx.db.get(args.passOnLogId);
    const id = await ctx.db.insert("passOnLogAcknowledgements", {
      clientId: log?.clientId,
      siteId: log?.siteId,
      passOnLogId: args.passOnLogId,
      userId: args.userId,
      acknowledgedAt: now,
      note: args.note ?? "",
    });
    const user = await ctx.db.get(args.userId);
    await ctx.runMutation(internal.activity.record, {
      clientId: log?.clientId,
      siteId: log?.siteId,
      checkpointId: log?.checkpointId,
      officerId: args.userId,
      activityType: "pass_on_log_ack",
      sourceTable: "passOnLogAcknowledgements",
      sourceId: id,
      siteName: log?.siteLabel ?? "",
      activityLabel: `Pass-on log acknowledged: ${log?.title ?? ""}`,
      occurredAt: now,
    });
    await ctx.runMutation(internal.audit.record, {
      action: "pass_on_log.acknowledged",
      actorId: args.userId,
      actorRole: user?.role ?? "guard",
      targetType: "pass_on_log",
      targetId: args.passOnLogId,
      details: `Acknowledged pass-on log: ${log?.title ?? ""}`,
      clientId: log?.clientId,
      siteId: log?.siteId,
      success: true,
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

export const listAcknowledgements = internalQuery({
  args: {
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let acknowledgements = args.userId
      ? await ctx.db
          .query("passOnLogAcknowledgements")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId!))
          .order("desc")
          .take(args.limit ?? 200)
      : await ctx.db
          .query("passOnLogAcknowledgements")
          .order("desc")
          .take(args.limit ?? 200);
    if (args.clientId) {
      acknowledgements = acknowledgements.filter(
        (ack) => ack.clientId === args.clientId,
      );
    }
    if (args.siteId) {
      acknowledgements = acknowledgements.filter(
        (ack) => ack.siteId === args.siteId,
      );
    }
    const users = await ctx.db.query("users").collect();
    const logs = await ctx.db.query("passOnLogs").collect();
    return acknowledgements.map((ack) => {
      const log = logs.find((item) => item._id === ack.passOnLogId);
      return {
        id: ack.legacyId ?? ack._id,
        passOnLogId: ack.passOnLogId,
        title: log?.title ?? "",
        siteLabel: log?.siteLabel ?? "",
        userId: ack.userId,
        userName: users.find((user) => user._id === ack.userId)?.name ?? "",
        acknowledgedAt: new Date(ack.acknowledgedAt).toISOString(),
        note: ack.note,
        clientId: ack.clientId ?? null,
        siteId: ack.siteId ?? null,
      };
    });
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    // Same shape as the other resolvers: a Convex id resolves directly, and
    // only a legacy id needs a lookup. Reading every pass-on to answer "does
    // this id exist" grew with the table.
    const normalized = ctx.db.normalizeId("passOnLogs", args.id);
    if (normalized) {
      return (await ctx.db.get(normalized)) ? normalized : null;
    }
    const byLegacyId = await ctx.db
      .query("passOnLogs")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .first();
    return byLegacyId?._id ?? null;
  },
});
