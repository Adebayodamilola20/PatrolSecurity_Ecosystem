import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isLateScanAlertsEnabled } from "./env";

/**
 * Late-scan alerts: a checkpoint with a start time (scheduledTimeIn, e.g.
 * "09:00") that has no scan by one minute past it is flagged straight away.
 *
 * - Times are Nigerian (WAT, UTC+1 all year, no daylight saving).
 * - One alert per checkpoint per day. It is written once; how late it is runs
 *   live off scheduledAt, so nothing is re-raised or re-sent each minute.
 * - The first scan closes it and records the final lateness.
 * - Only checkpoints someone is posted to are watched, so an empty post does
 *   not raise an alert every morning.
 */

const WAT_OFFSET_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
// A scan up to an hour before the start time counts as arriving on time.
const EARLY_WINDOW_MS = 60 * MINUTE_MS;

/** Nigerian calendar date for a moment, and the UTC instant that day starts. */
export function watDay(at: number) {
  const wat = new Date(at + WAT_OFFSET_MS);
  const serviceDate = wat.toISOString().slice(0, 10);
  const dayStartUtc =
    Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate()) - WAT_OFFSET_MS;
  return { serviceDate, dayStartUtc };
}

/** "09:00" / "9:00" -> minutes after midnight, or null when unset/invalid. */
export function parseStartTime(value: string | undefined | null): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Whole minutes late, never less than 1 once flagged. */
export function minutesLate(scheduledAt: number, at: number) {
  return Math.max(1, Math.floor((at - scheduledAt) / MINUTE_MS));
}

/** "09:00 WAT" for a stored instant. */
export function formatWat(at: number) {
  return `${new Date(at + WAT_OFFSET_MS).toISOString().slice(11, 16)} WAT`;
}

async function firstScanSince(ctx: MutationCtx, checkpointId: Id<"checkpoints">, from: number) {
  return await ctx.db
    .query("scans")
    .withIndex("by_checkpointId_scannedAt", (q) =>
      q.eq("checkpointId", checkpointId).gte("scannedAt", from),
    )
    .first();
}

async function postedGuards(ctx: MutationCtx, checkpoint: Doc<"checkpoints">) {
  const direct = await ctx.db
    .query("userCheckpointAssignments")
    .withIndex("by_checkpointId", (q) => q.eq("checkpointId", checkpoint._id))
    .collect();
  let userIds = direct.map((a) => a.userId);
  if (userIds.length === 0 && checkpoint.siteId) {
    const onSite = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_siteId", (q) => q.eq("siteId", checkpoint.siteId!))
      .collect();
    userIds = onSite.map((a) => a.userId);
  }
  const users = (await Promise.all([...new Set(userIds)].map((id) => ctx.db.get(id)))).filter(
    (u): u is Doc<"users"> => !!u && u.active && (u.role === "guard" || u.role === "supervisor"),
  );
  return users;
}

async function recordLateActivity(
  ctx: MutationCtx,
  alert: Doc<"lateScanAlerts">,
  officerId: Id<"users">,
  label: string,
  occurredAt: number,
) {
  await ctx.runMutation(internal.activity.record, {
    clientId: alert.clientId,
    siteId: alert.siteId,
    checkpointId: alert.checkpointId,
    officerId,
    activityType: "late_scan",
    sourceTable: "lateScanAlerts",
    sourceId: alert._id,
    siteName: alert.siteName,
    locationLabel: alert.checkpointName,
    activityLabel: label,
    occurredAt,
  });
}

/** Runs every minute from crons.ts. */
export const check = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!isLateScanAlertsEnabled()) return { enabled: false, created: 0, resolved: 0, missed: 0 };
    const now = Date.now();
    const { serviceDate, dayStartUtc } = watDay(now);
    let created = 0;
    let resolved = 0;
    let missed = 0;

    // 1. Close or expire alerts that are still open.
    const open = await ctx.db
      .query("lateScanAlerts")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    for (const alert of open) {
      const scan = await firstScanSince(ctx, alert.checkpointId, alert.scheduledAt - EARLY_WINDOW_MS);
      // A scan on a later day is not this day's arrival.
      const scanDay = scan ? watDay(scan.scannedAt).serviceDate : null;
      if (scan && scanDay === alert.serviceDate) {
        const late = minutesLate(alert.scheduledAt, scan.scannedAt);
        await ctx.db.patch(alert._id, {
          status: "resolved",
          scannedAt: scan.scannedAt,
          scannedBy: scan.officerId,
          lateMinutes: late,
        });
        await recordLateActivity(
          ctx,
          alert,
          scan.officerId,
          `Scanned ${late} min late (due ${alert.scheduledTime})`,
          scan.scannedAt,
        );
        resolved++;
      } else if (alert.serviceDate !== serviceDate) {
        // The day ended with no scan at all.
        await ctx.db.patch(alert._id, { status: "missed" });
        if (alert.guardIds[0]) {
          await recordLateActivity(
            ctx,
            alert,
            alert.guardIds[0],
            `Not scanned all day (due ${alert.scheduledTime})`,
            alert.scheduledAt,
          );
        }
        missed++;
      }
    }

    // 2. Raise today's alerts for start times that have passed unscanned.
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const sites = new Map((await ctx.db.query("sites").collect()).map((s) => [s._id, s]));
    for (const checkpoint of checkpoints) {
      if (!checkpoint.active) continue;
      const startMinutes = parseStartTime(checkpoint.scheduledTimeIn);
      if (startMinutes == null) continue;
      const scheduledAt = dayStartUtc + startMinutes * MINUTE_MS;
      // Flagged from one minute past the start time, i.e. no scan by 09:01.
      if (now < scheduledAt + MINUTE_MS) continue;
      // A checkpoint added after today's start time starts counting tomorrow.
      if (checkpoint.createdAt > scheduledAt) continue;

      const existing = await ctx.db
        .query("lateScanAlerts")
        .withIndex("by_checkpointId_serviceDate", (q) =>
          q.eq("checkpointId", checkpoint._id).eq("serviceDate", serviceDate),
        )
        .first();
      if (existing) continue;

      const scan = await firstScanSince(ctx, checkpoint._id, scheduledAt - EARLY_WINDOW_MS);
      if (scan && scan.scannedAt < scheduledAt + MINUTE_MS) continue; // on time

      const guards = await postedGuards(ctx, checkpoint);
      if (guards.length === 0) continue; // nobody posted, nothing to chase

      const site = checkpoint.siteId ? sites.get(checkpoint.siteId) : undefined;
      const scheduledTime = checkpoint.scheduledTimeIn.trim().padStart(5, "0");
      const alertId = await ctx.db.insert("lateScanAlerts", {
        checkpointId: checkpoint._id,
        siteId: checkpoint.siteId,
        clientId: checkpoint.clientId ?? site?.clientId,
        checkpointName: checkpoint.name,
        siteName: site?.name ?? "Unassigned site",
        serviceDate,
        scheduledTime,
        scheduledAt,
        detectedAt: now,
        guardIds: guards.map((g) => g._id),
        guardNames: guards.map((g) => g.name),
        status: "open",
        notificationStatus: "pending",
      });
      created++;
      // Sent once, when the alert is raised — never repeated while it is open.
      await ctx.scheduler.runAfter(0, internal.lateScans.notify, { alertId });
    }

    return { enabled: true, created, resolved, missed };
  },
});

export const get = internalQuery({
  args: { alertId: v.id("lateScanAlerts") },
  handler: async (ctx, args) => await ctx.db.get(args.alertId),
});

export const setNotificationStatus = internalMutation({
  args: { alertId: v.id("lateScanAlerts"), notificationStatus: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, { notificationStatus: args.notificationStatus });
  },
});

/** Emails the alert once (same recipients as missed patrols). No SMS. */
export const notify = internalAction({
  args: { alertId: v.id("lateScanAlerts") },
  handler: async (ctx, args) => {
    const alert = await ctx.runQuery(internal.lateScans.get, { alertId: args.alertId });
    if (!alert) return;
    const recipients = String(
      (await ctx.runQuery(internal.settings.getLatest, {
        settingKey: "missed_patrol_email_recipients",
      })) ?? "",
    )
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const status = await ctx.runAction(internal.notifications.sendLateScanAlert, {
      checkpointName: alert.checkpointName,
      siteName: alert.siteName,
      scheduledTime: alert.scheduledTime,
      detectedAt: formatWat(alert.detectedAt),
      guardNames: alert.guardNames,
      emailRecipients: recipients,
    });
    await ctx.runMutation(internal.lateScans.setNotificationStatus, {
      alertId: args.alertId,
      notificationStatus: status,
    });
  },
});

export const list = internalQuery({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"), v.literal("missed"))),
    serviceDate: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    let rows = args.serviceDate
      ? await ctx.db
          .query("lateScanAlerts")
          .withIndex("by_serviceDate", (q) => q.eq("serviceDate", args.serviceDate!))
          .order("desc")
          .take(limit)
      : args.status
        ? await ctx.db
            .query("lateScanAlerts")
            .withIndex("by_status", (q) => q.eq("status", args.status!))
            .order("desc")
            .take(limit)
        : await ctx.db.query("lateScanAlerts").order("desc").take(limit);
    if (args.serviceDate && args.status) rows = rows.filter((r) => r.status === args.status);
    if (args.clientId) rows = rows.filter((r) => r.clientId === args.clientId);
    const now = Date.now();
    return await Promise.all(
      rows.map(async (r) => {
        const scanner = r.scannedBy ? await ctx.db.get(r.scannedBy) : null;
        return {
          id: r._id,
          checkpointId: r.checkpointId,
          siteId: r.siteId ?? null,
          clientId: r.clientId ?? null,
          checkpointName: r.checkpointName,
          siteName: r.siteName,
          serviceDate: r.serviceDate,
          scheduledTime: r.scheduledTime,
          scheduledAt: new Date(r.scheduledAt).toISOString(),
          detectedAt: new Date(r.detectedAt).toISOString(),
          guardNames: r.guardNames,
          status: r.status,
          // Live while open; the final figure once scanned.
          lateMinutes: r.status === "open" ? minutesLate(r.scheduledAt, now) : (r.lateMinutes ?? null),
          scannedAt: r.scannedAt ? new Date(r.scannedAt).toISOString() : null,
          scannedAtWat: r.scannedAt ? formatWat(r.scannedAt) : null,
          scannedByName: scanner?.name ?? null,
          notificationStatus: r.notificationStatus,
        };
      }),
    );
  },
});
