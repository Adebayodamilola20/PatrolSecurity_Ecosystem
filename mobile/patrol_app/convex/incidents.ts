import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
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
    let incidents = await ctx.db.query("incidents").order("desc").collect();

    if (args.officerId) {
      incidents = incidents.filter(
        (incident) => incident.officerId === args.officerId,
      );
    }

    if (args.status) {
      incidents = incidents.filter((incident) => incident.status === args.status);
    }

    return incidents;
  },
});

export const listForApi = query({
  args: { status: v.optional(v.string()), officerId: v.optional(v.id("users")), severity: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let incidents = await ctx.db.query("incidents").order("desc").collect();
    if (args.status) incidents = incidents.filter(i => i.status === args.status);
    if (args.officerId) incidents = incidents.filter(i => i.officerId === args.officerId);
    if (args.severity) incidents = incidents.filter(i => i.severity === args.severity);
    const users = await ctx.db.query("users").collect();
    return incidents.map(i => ({
      id: i.legacyId ?? i._id, title: i.title, description: i.description,
      severity: i.severity, status: i.status,
      officerId: i.officerId,
      officerName: users.find(u => u._id === i.officerId)?.name ?? "",
      checkpointId: i.checkpointId, reportedAt: new Date(i.reportedAt).toISOString(),
      resolvedAt: i.resolvedAt ? new Date(i.resolvedAt).toISOString() : null,
    }));
  },
});

export const updateStatus = mutation({
  args: { incidentId: v.id("incidents"), status: v.string() },
  handler: async (ctx, args) => {
    const patch: any = { status: args.status };
    if (args.status === "resolved") patch.resolvedAt = Date.now();
    await ctx.db.patch(args.incidentId, patch);
    return await ctx.db.get(args.incidentId);
  },
});

export const missedPatrols = query({
  args: {},
  handler: async (ctx) => {
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;
    const scans = await ctx.db.query("scans").order("desc").collect();
    return checkpoints.filter(c => c.active).map(c => {
      const lastScan = scans.find(s => s.checkpointId === c._id);
      const elapsed = lastScan ? now - lastScan.scannedAt : Infinity;
      return { checkpointId: c.legacyId ?? c._id, checkpointName: c.name, lastScan: lastScan ? new Date(lastScan.scannedAt).toISOString() : null, missed: elapsed > c.expectedIntervalMinutes * 60 * 1000, minutesOverdue: Math.round((elapsed - c.expectedIntervalMinutes * 60 * 1000) / 60000) };
    }).filter(c => c.missed);
  },
});

export const create = mutation({
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
    return await ctx.db.insert("incidents", {
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
