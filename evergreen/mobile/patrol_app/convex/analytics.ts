import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Patrol analytics for the staff dashboard and the client portal.
 *
 * Everything here is derived from rows that already exist — scans, shifts,
 * incidents, reports. Nothing is estimated, sampled, or projected: a number on
 * an analytics page can always be traced back to records the user can open.
 *
 * The two callers differ in one way that matters: clients may never see guard
 * identities (AGM rule), so `includeGuards` gates the only block that names
 * anyone. The client portal passes false and gets counts instead of names.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// A window this wide is already thousands of rows on a busy account. The cap
// exists so a query can't quietly grow past what Convex will read in one
// transaction; `truncated` tells the UI when it bit, rather than silently
// under-reporting.
const MAX_ROWS = 10_000;

const MIN_DAYS = 1;
const MAX_DAYS = 90;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local-time YYYY-MM-DD, so buckets line up with the viewer's calendar. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export const summary = internalQuery({
  args: {
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    days: v.number(),
    // False for the client portal: no guard names ever leave the tenant.
    includeGuards: v.boolean(),
  },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(Math.round(args.days) || 30, MIN_DAYS), MAX_DAYS);
    const until = Date.now();
    const since = startOfDay(until) - (days - 1) * DAY_MS;
    let truncated = false;

    // ---- Scope ------------------------------------------------------------
    let sites: Doc<"sites">[];
    if (args.siteId) {
      const site = await ctx.db.get(args.siteId);
      // A site filter that points outside the caller's client must collapse to
      // nothing rather than fall back to the whole tenant.
      sites = site && (!args.clientId || site.clientId === args.clientId) ? [site] : [];
    } else if (args.clientId) {
      sites = await ctx.db
        .query("sites")
        .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId!))
        .collect();
    } else {
      sites = await ctx.db.query("sites").collect();
    }

    const scoped = Boolean(args.siteId || args.clientId);
    const siteIds = sites.map((s) => s._id);
    const siteById = new Map(sites.map((s) => [s._id as string, s]));

    // ---- Scans ------------------------------------------------------------
    // Scoped reads go through the per-site time index so a client portal query
    // costs what that client actually has, not what the whole org has.
    const scans: Doc<"scans">[] = [];
    if (scoped) {
      for (const siteId of siteIds) {
        const rows = await ctx.db
          .query("scans")
          .withIndex("by_siteId_scannedAt", (q) =>
            q.eq("siteId", siteId).gte("scannedAt", since),
          )
          .take(MAX_ROWS);
        if (rows.length >= MAX_ROWS) truncated = true;
        scans.push(...rows);
      }
      // Checkpoints that belong to the client but sit outside any site would
      // otherwise be invisible here, and their patrols are real patrols.
      if (args.clientId && !args.siteId) {
        const orphans = await ctx.db
          .query("checkpoints")
          .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId!))
          .collect();
        for (const cp of orphans) {
          if (cp.siteId) continue;
          const rows = await ctx.db
            .query("scans")
            .withIndex("by_checkpointId_scannedAt", (q) =>
              q.eq("checkpointId", cp._id).gte("scannedAt", since),
            )
            .take(MAX_ROWS);
          scans.push(...rows);
        }
      }
    } else {
      const rows = await ctx.db
        .query("scans")
        .withIndex("by_scannedAt", (q) => q.gte("scannedAt", since))
        .take(MAX_ROWS);
      if (rows.length >= MAX_ROWS) truncated = true;
      scans.push(...rows);
    }

    // ---- Daily series -----------------------------------------------------
    // Seed every day in the window so gaps render as real zeroes rather than
    // disappearing and making a quiet week look like a short one.
    type Bucket = { date: string; patrols: number; verified: number; incidents: number };
    const buckets = new Map<string, Bucket>();
    for (let i = 0; i < days; i++) {
      const key = dayKey(since + i * DAY_MS);
      buckets.set(key, { date: key, patrols: 0, verified: 0, incidents: 0 });
    }

    let verifiedPatrols = 0;
    const perSite = new Map<string, { patrols: number; verified: number; lastScanAt: number | null }>();
    const guardScans = new Map<string, number>();

    for (const scan of scans) {
      const bucket = buckets.get(dayKey(scan.scannedAt));
      if (bucket) {
        bucket.patrols += 1;
        if (scan.gpsValid) bucket.verified += 1;
      }
      if (scan.gpsValid) verifiedPatrols += 1;

      const key = (scan.siteId as string | undefined) ?? "unassigned";
      const agg = perSite.get(key) ?? { patrols: 0, verified: 0, lastScanAt: null };
      agg.patrols += 1;
      if (scan.gpsValid) agg.verified += 1;
      if (agg.lastScanAt === null || scan.scannedAt > agg.lastScanAt) agg.lastScanAt = scan.scannedAt;
      perSite.set(key, agg);

      if (args.includeGuards) {
        const officer = scan.officerId as string;
        guardScans.set(officer, (guardScans.get(officer) ?? 0) + 1);
      }
    }

    // ---- Incidents --------------------------------------------------------
    // No time index on incidents, so read the tenant's rows and filter. The
    // table is low-volume by nature (one row per real-world event).
    let incidentRows: Doc<"incidents">[];
    if (args.clientId) {
      incidentRows = await ctx.db
        .query("incidents")
        .withIndex("by_clientId_status", (q) => q.eq("clientId", args.clientId!))
        .take(MAX_ROWS);
    } else {
      incidentRows = await ctx.db.query("incidents").take(MAX_ROWS);
    }
    const scopedSiteIds = new Set<string>(siteIds as unknown as string[]);
    const incidents = incidentRows.filter((i) => {
      if (i.reportedAt < since) return false;
      if (args.siteId) return i.siteId === args.siteId;
      if (args.clientId && i.siteId) return scopedSiteIds.has(i.siteId as string);
      return true;
    });

    for (const incident of incidents) {
      const bucket = buckets.get(dayKey(incident.reportedAt));
      if (bucket) bucket.incidents += 1;
    }

    const bySeverity = new Map<string, number>();
    const byCategory = new Map<string, number>();
    let openIncidents = 0;
    for (const incident of incidents) {
      bySeverity.set(incident.severity, (bySeverity.get(incident.severity) ?? 0) + 1);
      const category = incident.category ?? "Other";
      byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
      if (incident.status !== "resolved") openIncidents += 1;
    }

    // ---- Shifts -----------------------------------------------------------
    const shifts: Doc<"shifts">[] = [];
    if (scoped) {
      for (const siteId of siteIds) {
        const rows = await ctx.db
          .query("shifts")
          .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
          .take(MAX_ROWS);
        shifts.push(...rows.filter((s) => s.clockIn >= since));
      }
    } else {
      const rows = await ctx.db.query("shifts").take(MAX_ROWS);
      shifts.push(...rows.filter((s) => s.clockIn >= since));
    }

    // Only closed shifts contribute hours; an open shift has no duration yet
    // and counting "now - clockIn" would inflate today's total every reload.
    let dutyMs = 0;
    let closedShifts = 0;
    for (const shift of shifts) {
      if (shift.clockOut && shift.clockOut > shift.clockIn) {
        dutyMs += shift.clockOut - shift.clockIn;
        closedShifts += 1;
      }
    }

    // ---- Reports ----------------------------------------------------------
    let reportRows: Doc<"reportSubmissions">[];
    if (args.clientId) {
      reportRows = await ctx.db
        .query("reportSubmissions")
        .withIndex("by_clientId_submittedAt", (q) =>
          q.eq("clientId", args.clientId!).gte("submittedAt", since),
        )
        .take(MAX_ROWS);
    } else {
      reportRows = await ctx.db
        .query("reportSubmissions")
        .withIndex("by_submittedAt", (q) => q.gte("submittedAt", since))
        .take(MAX_ROWS);
    }
    const reports = args.siteId
      ? reportRows.filter((r) => r.siteId === args.siteId)
      : reportRows;

    // ---- Guards (staff dashboard only) ------------------------------------
    let topGuards: { id: string; name: string; patrols: number }[] = [];
    if (args.includeGuards) {
      const ranked = [...guardScans.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      for (const [userId, patrols] of ranked) {
        const user = await ctx.db.get(userId as Id<"users">);
        topGuards.push({
          id: userId,
          name: user?.name ?? user?.email ?? "Unknown",
          patrols,
        });
      }
    }

    const patrols = scans.length;
    const activeGuardCount = new Set(scans.map((s) => s.officerId as string)).size;

    return {
      range: { since, until, days },
      truncated,
      totals: {
        patrols,
        verifiedPatrols,
        verificationRate: pct(verifiedPatrols, patrols),
        incidents: incidents.length,
        openIncidents,
        reports: reports.length,
        shifts: shifts.length,
        dutyHours: Math.round((dutyMs / 3_600_000) * 10) / 10,
        avgShiftHours: closedShifts
          ? Math.round((dutyMs / closedShifts / 3_600_000) * 10) / 10
          : null,
        activeGuards: activeGuardCount,
        sites: sites.length,
      },
      series: [...buckets.values()],
      sites: [...perSite.entries()]
        .map(([id, agg]) => ({
          id,
          name: siteById.get(id)?.name ?? "Unassigned checkpoints",
          patrols: agg.patrols,
          verified: agg.verified,
          verificationRate: pct(agg.verified, agg.patrols),
          lastScanAt: agg.lastScanAt,
        }))
        .sort((a, b) => b.patrols - a.patrols),
      incidentsBySeverity: [...bySeverity.entries()].map(([severity, count]) => ({ severity, count })),
      incidentsByCategory: [...byCategory.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      topGuards,
    };
  },
});
