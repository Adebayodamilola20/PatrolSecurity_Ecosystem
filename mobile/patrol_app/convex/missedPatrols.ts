import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_GRACE_PERIOD_MINUTES = 5;

function positiveMinutes(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
    clientId: v.optional(v.id("clients")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let alerts = await ctx.db.query("missedPatrolAlerts").order("desc").collect();

    if (args.status) {
      alerts = alerts.filter((alert) => alert.status === args.status);
    }
    if (args.clientId) {
      alerts = alerts.filter((alert) => alert.clientId === args.clientId);
    }

    return alerts.slice(0, args.limit ?? 100).map((alert) => ({
      id: alert._id,
      checkpointId: alert.checkpointId,
      siteId: alert.siteId ?? null,
      clientId: alert.clientId ?? null,
      checkpointName: alert.checkpointName,
      siteName: alert.siteName,
      lastScanAt: alert.lastScanAt ? new Date(alert.lastScanAt).toISOString() : null,
      dueAt: new Date(alert.dueAt).toISOString(),
      detectedAt: new Date(alert.detectedAt).toISOString(),
      expectedIntervalMinutes: alert.expectedIntervalMinutes,
      gracePeriodMinutes: alert.gracePeriodMinutes,
      status: alert.status,
      notificationStatus: alert.notificationStatus,
    }));
  },
});

export const checkNow = mutation({
  args: {
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const checkpoints = (await ctx.db.query("checkpoints").collect()).filter(
      (checkpoint) => checkpoint.active && (!args.clientId || checkpoint.clientId === args.clientId),
    );
    const sites = await ctx.db.query("sites").collect();
    const scans = await ctx.db.query("scans").collect();

    const created = [];
    const overdue = [];

    for (const checkpoint of checkpoints) {
      const site = checkpoint.siteId
        ? sites.find((item) => item._id === checkpoint.siteId)
        : undefined;
      const intervalMinutes = positiveMinutes(
        checkpoint.expectedIntervalMinutes,
        positiveMinutes(site?.patrolIntervalMinutes, DEFAULT_INTERVAL_MINUTES),
      );
      const gracePeriodMinutes = positiveMinutes(
        site?.patrolGracePeriodMinutes,
        DEFAULT_GRACE_PERIOD_MINUTES,
      );

      const latestScan = scans
        .filter((scan) => scan.checkpointId === checkpoint._id)
        .sort((a, b) => b.scannedAt - a.scannedAt)[0];
      const lastScanAt = latestScan?.scannedAt;
      const dueAt = (lastScanAt ?? checkpoint.createdAt) +
        (intervalMinutes + gracePeriodMinutes) * 60 * 1000;

      if (dueAt > now) continue;

      const summary = {
        checkpointId: checkpoint._id,
        siteId: checkpoint.siteId ?? null,
        clientId: checkpoint.clientId ?? null,
        checkpointName: checkpoint.name,
        siteName: site?.name ?? "Unassigned site",
        lastScanAt: lastScanAt ? new Date(lastScanAt).toISOString() : null,
        dueAt: new Date(dueAt).toISOString(),
        expectedIntervalMinutes: intervalMinutes,
        gracePeriodMinutes,
      };
      overdue.push(summary);

      const existingOpen = await ctx.db
        .query("missedPatrolAlerts")
        .withIndex("by_checkpointId_status", (q) =>
          q.eq("checkpointId", checkpoint._id).eq("status", "open"),
        )
        .first();
      if (existingOpen) continue;

      const alertId = await ctx.db.insert("missedPatrolAlerts", {
        checkpointId: checkpoint._id,
        siteId: checkpoint.siteId,
        clientId: checkpoint.clientId,
        checkpointName: checkpoint.name,
        siteName: site?.name ?? "Unassigned site",
        lastScanAt,
        dueAt,
        detectedAt: now,
        expectedIntervalMinutes: intervalMinutes,
        gracePeriodMinutes,
        status: "open",
        notificationStatus: "dashboard_alert_created",
        deliveryPayload: {},
      });
      created.push({ ...summary, id: alertId });
    }

    return {
      checkedAt: new Date(now).toISOString(),
      overdueCount: overdue.length,
      createdCount: created.length,
      overdue,
      created,
    };
  },
});

export const markNotificationResult = mutation({
  args: {
    alertId: v.id("missedPatrolAlerts"),
    notificationStatus: v.string(),
    deliveryPayload: v.any(),
  },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Missed patrol alert not found");

    await ctx.db.patch(args.alertId, {
      notificationStatus: args.notificationStatus,
      deliveryPayload: args.deliveryPayload,
    });

    return { id: args.alertId, notificationStatus: args.notificationStatus };
  },
});
