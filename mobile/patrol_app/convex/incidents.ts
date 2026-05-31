import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

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
    return incidents.map((i) => ({
      id: i.legacyId ?? i._id,
      title: i.title,
      description: i.description,
      severity: i.severity,
      status: i.status,
      officerId: i.officerId,
      officerName: users.find((u) => u._id === i.officerId)?.name ?? "",
      checkpointId: i.checkpointId,
      reportedAt: new Date(i.reportedAt).toISOString(),
      resolvedAt: i.resolvedAt ? new Date(i.resolvedAt).toISOString() : null,
    }));
  },
});

export const updateStatus = internalMutation({
  args: { incidentId: v.id("incidents"), status: v.string() },
  handler: async (ctx, args) => {
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

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("incidents")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) return byLegacyId._id;
    const all = await ctx.db.query("incidents").collect();
    return all.find(i => i._id === args.id)?._id ?? null;
  },
});

export const create = internalMutation({
  args: {
    officerId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    title: v.string(),
    description: v.optional(v.string()),
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
    return await ctx.db.insert("incidents", {
      clientId: checkpoint?.clientId ?? officer?.clientId,
      siteId: checkpoint?.siteId,
      officerId: args.officerId,
      checkpointId: args.checkpointId,
      title: args.title,
      description: args.description ?? "",
      severity: args.severity ?? "low",
      status: "open",
      reportedAt: Date.now(),
    });
  },
});
