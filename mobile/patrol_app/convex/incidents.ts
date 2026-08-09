import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { deletedNamesByType } from "./lib/tombstones";

const incidentStatus = v.union(
  v.literal("open"),
  v.literal("investigating"),
  v.literal("resolved"),
);

const incidentCategory = v.union(
  v.literal("Security Incident"),
  v.literal("Theft"),
  v.literal("Fire"),
  v.literal("Medical"),
  v.literal("Visitor Issue"),
  v.literal("Suspicious Activity"),
  v.literal("Other"),
);

export const list = internalQuery({
  args: {
    officerId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("investigating"),
        v.literal("resolved"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const query = args.officerId && args.status
      ? ctx.db.query("incidents").withIndex("by_officerId_status", (q) =>
          q.eq("officerId", args.officerId!).eq("status", args.status!),
        )
      : args.officerId
        ? ctx.db.query("incidents").withIndex("by_officerId_status", (q) =>
            q.eq("officerId", args.officerId!),
          )
        : args.status
          ? ctx.db.query("incidents").withIndex("by_status", (q) =>
              q.eq("status", args.status!),
            )
          : ctx.db.query("incidents");
    let incidents = await query.order("desc").take(100);

    return incidents;
  },
});

export const listForApi = internalQuery({
  args: {
    status: v.optional(v.string()),
    officerId: v.optional(v.id("users")),
    severity: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const query = args.clientId && args.status
      ? ctx.db.query("incidents").withIndex("by_clientId_status", (q) =>
          q.eq("clientId", args.clientId!).eq("status", args.status! as "open" | "investigating" | "resolved"),
        )
      : args.clientId
        ? ctx.db.query("incidents").withIndex("by_clientId_status", (q) =>
            q.eq("clientId", args.clientId!),
          )
        : args.status
          ? ctx.db.query("incidents").withIndex("by_status", (q) =>
              q.eq("status", args.status! as "open" | "investigating" | "resolved"),
            )
          : args.officerId
            ? ctx.db.query("incidents").withIndex("by_officerId_status", (q) =>
                q.eq("officerId", args.officerId!),
              )
            : ctx.db.query("incidents");
    let incidents = await query.order("desc").take(100);
    if (args.status)
      incidents = incidents.filter((i) => i.status === args.status);
    if (args.officerId)
      incidents = incidents.filter((i) => i.officerId === args.officerId);
    if (args.severity)
      incidents = incidents.filter((i) => i.severity === args.severity);
    if (args.clientId) {
      const cp = await ctx.db.query("checkpoints").collect();
      const cpIds = new Set(
        cp.filter((c) => c.clientId === args.clientId).map((c) => c._id),
      );
      incidents = incidents.filter(
        (i) =>
          i.clientId === args.clientId ||
          (i.checkpointId && cpIds.has(i.checkpointId)),
      );
    }
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const sites = await ctx.db.query("sites").collect();
    // An incident outlives the guard who filed it, so a deleted guard's
    // reports stay attributed instead of going nameless.
    const goneOfficers = await deletedNamesByType(ctx, "user");
    return incidents.map((i) => {
      const checkpoint = i.checkpointId
        ? checkpoints.find((c) => c._id === i.checkpointId)
        : undefined;
      const site = i.siteId
        ? sites.find((s) => s._id === i.siteId)
        : checkpoint?.siteId
          ? sites.find((s) => s._id === checkpoint.siteId)
          : undefined;
      return {
        id: i.legacyId ?? i._id,
        title: i.title,
        category: i.category ?? "Security Incident",
        description: i.description,
        // API field name is stable (`photoUrls`): the walker in http.ts turns
        // these storage refs into signed URLs before they leave the server.
        photoUrls: i.photoStorageIds ?? [],
        severity: i.severity,
        status: i.status,
        officerId: i.officerId,
        officerName:
          users.find((u) => u._id === i.officerId)?.name ??
          goneOfficers.get(i.officerId) ??
          "",
        checkpointId: i.checkpointId,
        checkpointName: checkpoint?.name ?? null,
        siteName: site?.name ?? null,
        latitude: checkpoint?.latitude ?? null,
        longitude: checkpoint?.longitude ?? null,
        reportedAt: new Date(i.reportedAt).toISOString(),
        resolvedAt: i.resolvedAt ? new Date(i.resolvedAt).toISOString() : null,
      };
    });
  },
});

// [authz] Closing an incident is a control-room decision about someone else's
// record, so the actor travels with the request and is checked here as well as
// at the route. An internal mutation is a second door into the same row: the
// route in front of it today has the check, the caller written next year may
// not, and by then this row is a client's audit trail.
export const updateStatus = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    status: incidentStatus,
    actorRole: v.string(),
    actorClientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident) throw new Error("Incident not found");
    // Staff are unscoped by design (see the supervisor decision, 2026-08-08).
    // Everyone else may only touch incidents belonging to their own client.
    if (args.actorRole !== "admin" && args.actorRole !== "supervisor") {
      if (!args.actorClientId || incident.clientId !== args.actorClientId) {
        throw new Error("Access denied: cannot change this incident's status");
      }
    }
    const patch: any = { status: args.status };
    if (args.status === "resolved") patch.resolvedAt = Date.now();
    await ctx.db.patch(args.incidentId, patch);
    return await ctx.db.get(args.incidentId);
  },
});

export const missedPatrols = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const queryCheckpoints = args.clientId
      ? ctx.db.query("checkpoints").withIndex("by_clientId", (q) =>
          q.eq("clientId", args.clientId),
        )
      : ctx.db.query("checkpoints");
    let checkpoints = await queryCheckpoints.take(500);
    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;
    const scans = await ctx.db.query("scans").order("desc").take(500);
    return checkpoints
      .filter((c) => c.active)
      .map((c) => {
        const lastScan = scans.find((s) => s.checkpointId === c._id);
        const elapsed = lastScan ? now - lastScan.scannedAt : Infinity;
        return {
          checkpointId: c.legacyId ?? c._id,
          checkpointName: c.name,
          lastScan: lastScan
            ? new Date(lastScan.scannedAt).toISOString()
            : null,
          missed: elapsed > c.expectedIntervalMinutes * 60 * 1000,
          minutesOverdue: Math.round(
            (elapsed - c.expectedIntervalMinutes * 60 * 1000) / 60000,
          ),
        };
      })
      .filter((c) => c.missed);
  },
});

// Resolves a caller-supplied id (legacy or Convex) to the row, and hands back
// exactly the fields an authorization decision needs. Returning the scope with
// the id is what lets the route answer 403 instead of 500 — the mutation still
// re-checks, but the caller gets a straight answer.
export const resolveForAuth = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("incidents")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    const normalized = ctx.db.normalizeId("incidents", args.id);
    const incident = byLegacyId ?? (normalized ? await ctx.db.get(normalized) : null);
    if (!incident) return null;
    return {
      id: incident._id,
      clientId: incident.clientId ?? null,
      siteId: incident.siteId ?? null,
      officerId: incident.officerId,
    };
  },
});

export const create = internalMutation({
  args: {
    officerId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    category: v.optional(incidentCategory),
    title: v.string(),
    description: v.optional(v.string()),
    photoStorageIds: v.optional(v.array(v.string())),
    severity: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("critical"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const officer = await ctx.db.get(args.officerId);
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;
    const reportedAt = Date.now();
    const incidentId = await ctx.db.insert("incidents", {
      clientId: checkpoint?.clientId ?? officer?.clientId,
      siteId: checkpoint?.siteId,
      officerId: args.officerId,
      checkpointId: args.checkpointId,
      category: args.category ?? "Security Incident",
      title: args.title,
      description: args.description ?? "",
      photoStorageIds: args.photoStorageIds ?? [],
      severity: args.severity ?? "low",
      status: "open",
      reportedAt,
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: checkpoint?.clientId ?? officer?.clientId,
      siteId: checkpoint?.siteId,
      checkpointId: args.checkpointId,
      officerId: args.officerId,
      activityType: "incident",
      sourceTable: "incidents",
      sourceId: incidentId,
      locationLabel: checkpoint?.name ?? "",
      activityLabel: `Incident: ${args.category ?? "Security Incident"}`,
      occurredAt: reportedAt,
    });
    return incidentId;
  },
});
