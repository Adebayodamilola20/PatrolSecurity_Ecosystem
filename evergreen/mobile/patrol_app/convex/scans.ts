import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { distanceMeters } from "./lib/geo";
import { deletedNamesByType } from "./lib/tombstones";

export const list = internalQuery({
  args: {
    officerId: v.optional(v.id("users")),
    checkpointId: v.optional(v.id("checkpoints")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = args.officerId
      ? ctx.db.query("scans").withIndex("by_officerId_scannedAt", (q) =>
          q.eq("officerId", args.officerId!),
        )
      : ctx.db.query("scans");
    let scans = await query.order("desc").take(args.limit ?? 100);

    if (args.checkpointId) {
      scans = scans.filter((scan) => scan.checkpointId === args.checkpointId);
    }

    return scans;
  },
});

export const listForApi = internalQuery({
  args: {
    officerId: v.optional(v.id("users")),
    checkpointId: v.optional(v.id("checkpoints")),
    limit: v.optional(v.number()),
    clientId: v.optional(v.id("clients")),
    // Optional scannedAt range (epoch ms) so the full history can be filtered
    // by date instead of only the most-recent `limit` rows.
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hasRange = args.startDate != null || args.endDate != null;
    // Narrow an index range builder to the requested scannedAt window.
    const withScannedAt = (q: any) => {
      let r = q;
      if (args.startDate != null) r = r.gte("scannedAt", args.startDate);
      if (args.endDate != null) r = r.lte("scannedAt", args.endDate);
      return r;
    };

    const query = args.checkpointId
      ? ctx.db.query("scans").withIndex("by_checkpointId_scannedAt", (q) =>
          withScannedAt(q.eq("checkpointId", args.checkpointId!)),
        )
      : args.officerId
        ? ctx.db.query("scans").withIndex("by_officerId_scannedAt", (q) =>
            withScannedAt(q.eq("officerId", args.officerId!)),
          )
        : hasRange
          ? // For client-scoped or global reads, a scannedAt range index keeps
            // the date window exact (the client filter below still applies).
            ctx.db.query("scans").withIndex("by_scannedAt", (q) => withScannedAt(q))
          : args.clientId
            ? ctx.db.query("scans").withIndex("by_clientId", (q) =>
                q.eq("clientId", args.clientId!),
              )
            : ctx.db.query("scans");
    let scans = await query.order("desc").take(args.limit ?? 100);

    // When a non-officer index was used, still enforce officer scope (guards).
    if (args.officerId) {
      scans = scans.filter((scan) => scan.officerId === args.officerId);
    }

    if (args.checkpointId) {
      scans = scans.filter((scan) => scan.checkpointId === args.checkpointId);
    }

    if (args.clientId) {
      const clientCheckpoints = await ctx.db.query("checkpoints").collect();
      const cpIds = new Set(
        clientCheckpoints
          .filter((cp) => cp.clientId === args.clientId)
          .map((cp) => cp._id),
      );
      scans = scans.filter(
        (scan) =>
          scan.clientId === args.clientId || cpIds.has(scan.checkpointId),
      );
    }

    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    // A scan outlives the guard who took it and the QR point it was taken at,
    // so fall back to the tombstone name rather than showing the record blank.
    const [goneOfficers, goneCheckpoints] = await Promise.all([
      deletedNamesByType(ctx, "user"),
      deletedNamesByType(ctx, "checkpoint"),
    ]);

    return scans.map((scan) => {
      const officer = users.find((user) => user._id === scan.officerId);
      const checkpoint = checkpoints.find(
        (item) => item._id === scan.checkpointId,
      );

      return {
        id: scan.legacyId ?? scan._id,
        officerId: officer?.legacyId ?? officer?._id ?? "",
        officerConvexId: scan.officerId,
        officerName: officer?.name ?? goneOfficers.get(scan.officerId) ?? "",
        checkpointId: checkpoint?.legacyId ?? checkpoint?._id ?? "",
        checkpointConvexId: scan.checkpointId,
        checkpointName: checkpoint?.name ?? goneCheckpoints.get(scan.checkpointId) ?? "",
        checkpointCode: checkpoint?.code ?? "",
        scannedAt: new Date(scan.scannedAt).toISOString(),
        receivedAt: new Date(scan.receivedAt).toISOString(),
        // How long this scan sat on the phone before it reached the server.
        // Zero for a live scan. A large value is not proof of anything on its
        // own, but a night of them from one guard is worth a question — which
        // is exactly what the old `receivedAt: scannedAt` made unaskable.
        syncDelayMs: Math.max(0, scan.receivedAt - scan.scannedAt),
        gpsLatitude: scan.gpsLatitude ?? 0,
        gpsLongitude: scan.gpsLongitude ?? 0,
        gpsValid: scan.gpsValid,
        gpsMocked: scan.gpsMocked ?? false,
        distanceMeters: scan.distanceMeters ?? 0,
        notes: scan.notes,
      };
    });
  },
});

export const getRecent = internalQuery({
  args: {
    limit: v.optional(v.number()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    let scans = await ctx.db
      .query("scans")
      .withIndex("by_scannedAt")
      .order("desc")
      .take(args.limit ?? 50);
    if (args.clientId) {
      const cps = await ctx.db.query("checkpoints").collect();
      const cpIds = new Set(
        cps.filter((cp) => cp.clientId === args.clientId).map((cp) => cp._id),
      );
      scans = scans.filter((s) => cpIds.has(s.checkpointId));
    }
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    // A scan outlives the guard who took it and the QR point it was taken at,
    // so fall back to the tombstone name rather than showing the record blank.
    const [goneOfficers, goneCheckpoints] = await Promise.all([
      deletedNamesByType(ctx, "user"),
      deletedNamesByType(ctx, "checkpoint"),
    ]);
    return scans.map((s) => ({
      id: s.legacyId ?? s._id,
      officerId: s.officerId,
      officerName:
        users.find((u) => u._id === s.officerId)?.name ??
        goneOfficers.get(s.officerId) ??
        "",
      checkpointId: s.checkpointId,
      checkpointName:
        checkpoints.find((c) => c._id === s.checkpointId)?.name ??
        goneCheckpoints.get(s.checkpointId) ??
        "",
      scannedAt: new Date(s.scannedAt).toISOString(),
      gpsLatitude: s.gpsLatitude,
      gpsLongitude: s.gpsLongitude,
      gpsValid: s.gpsValid,
      distanceMeters: s.distanceMeters,
    }));
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("scans")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) return byLegacyId._id;
    // Not a legacy id, so it should be a Convex one. This used to read
    // the whole table and scan it for a matching _id — on scans, the
    // largest table here, that is the entire patrol history loaded to
    // answer "does this id exist". normalizeId answers it directly.
    const normalized = ctx.db.normalizeId("scans", args.id);
    if (!normalized) return null;
    return (await ctx.db.get(normalized)) ? normalized : null;
  },
});

export const getDetail = internalQuery({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) return null;
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    // A scan outlives the guard who took it and the QR point it was taken at,
    // so fall back to the tombstone name rather than showing the record blank.
    const [goneOfficers, goneCheckpoints] = await Promise.all([
      deletedNamesByType(ctx, "user"),
      deletedNamesByType(ctx, "checkpoint"),
    ]);
    return {
      id: scan.legacyId ?? scan._id,
      clientId:
        scan.clientId ??
        checkpoints.find((c) => c._id === scan.checkpointId)?.clientId ??
        null,
      // Both resolved through the checkpoint when the scan predates the
      // denormalised columns. The /scans/{id} route needs them to decide
      // whether the caller is allowed to see this row at all, so a null here
      // is a refusal rather than a blank field.
      siteId:
        scan.siteId ??
        checkpoints.find((c) => c._id === scan.checkpointId)?.siteId ??
        null,
      officerId: scan.officerId,
      officerName:
        users.find(u => u._id === scan.officerId)?.name ??
        goneOfficers.get(scan.officerId) ??
        "",
      checkpointId: scan.checkpointId,
      checkpointName:
        checkpoints.find(c => c._id === scan.checkpointId)?.name ??
        goneCheckpoints.get(scan.checkpointId) ??
        "",
      checkpointCode: checkpoints.find(c => c._id === scan.checkpointId)?.code ?? "",
      scannedAt: new Date(scan.scannedAt).toISOString(),
      receivedAt: new Date(scan.receivedAt).toISOString(),
      gpsLatitude: scan.gpsLatitude,
      gpsLongitude: scan.gpsLongitude,
      gpsValid: scan.gpsValid,
      distanceMeters: scan.distanceMeters,
      notes: scan.notes,
    };
  },
});

export const getById = internalQuery({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.scanId);
    if (!s) return null;
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    // A scan outlives the guard who took it and the QR point it was taken at,
    // so fall back to the tombstone name rather than showing the record blank.
    const [goneOfficers, goneCheckpoints] = await Promise.all([
      deletedNamesByType(ctx, "user"),
      deletedNamesByType(ctx, "checkpoint"),
    ]);
    return {
      id: s.legacyId ?? s._id,
      officerId: s.officerId,
      officerName:
        users.find((u) => u._id === s.officerId)?.name ??
        goneOfficers.get(s.officerId) ??
        "",
      checkpointId: s.checkpointId,
      checkpointName:
        checkpoints.find((c) => c._id === s.checkpointId)?.name ??
        goneCheckpoints.get(s.checkpointId) ??
        "",
      checkpointCode:
        checkpoints.find((c) => c._id === s.checkpointId)?.code ?? "",
      scannedAt: new Date(s.scannedAt).toISOString(),
      receivedAt: new Date(s.receivedAt).toISOString(),
      gpsLatitude: s.gpsLatitude,
      gpsLongitude: s.gpsLongitude,
      gpsValid: s.gpsValid,
      distanceMeters: s.distanceMeters,
      notes: s.notes,
    };
  },
});

/**
 * How far ahead of the server a phone's clock may run before its claim is
 * discarded. Phones drift; a scan cannot have happened in the future.
 */
const CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * Marks an error as a deliberate refusal rather than a fault.
 *
 * The payload after the prefix is JSON: `message` is written for the guard
 * standing at the gate, `details` is for the audit trail. Both have to travel
 * out through the exception because the refusal has to abort the mutation —
 * see recordRejection for why the audit row cannot be written before it.
 */
export const SCAN_REFUSED_PREFIX = "SCAN_REFUSED:";

export function scanRefusal(details: string, message: string): Error {
  return new Error(SCAN_REFUSED_PREFIX + JSON.stringify({ details, message }));
}

export function parseScanRefusal(
  error: unknown,
): { details: string; message: string } | null {
  if (!(error instanceof Error) || !error.message.startsWith(SCAN_REFUSED_PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(error.message.slice(SCAN_REFUSED_PREFIX.length));
  } catch {
    return { details: "Scan refused", message: "This scan could not be accepted." };
  }
}

/**
 * Records a refused scan, from outside the mutation that refused it.
 *
 * A Convex mutation is one transaction. `rejectScan` wrote its audit row and
 * then threw to abort the scan — and the throw rolled the audit row back with
 * everything else, so every `scan.rejected` entry this system has ever written
 * was discarded at the moment it mattered. The trail showing a guard trying to
 * scan from outside the geofence, or from a spoofed location, did not exist.
 *
 * The HTTP action is not transactional, so it catches the refusal and calls
 * this afterwards as a fresh transaction that actually commits.
 */
export const recordRejection = internalMutation({
  args: {
    officerId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const officer = await ctx.db.get(args.officerId);
    const checkpoint = args.checkpointId ? await ctx.db.get(args.checkpointId) : null;
    await ctx.runMutation(internal.audit.record, {
      action: "scan.rejected",
      actorId: args.officerId,
      actorRole: officer?.role ?? "guard",
      targetType: "checkpoint",
      targetId: args.checkpointId,
      details: args.details,
      clientId: checkpoint?.clientId ?? officer?.clientId,
      siteId: checkpoint?.siteId,
      success: false,
    });
  },
});

/**
 * Works out when a scan actually happened, from an untrusted device clock.
 *
 * Every rule here is "what could physically have occurred": not in the future
 * beyond ordinary drift, not before the guard clocked in because they were not
 * on duty, and not after the moment it arrived. Anything outside that collapses
 * to the arrival time — the old behaviour, and the safe direction to fail. A
 * scan credited later than it happened understates a patrol; one credited
 * earlier would let a wound-back device clock rewrite history.
 */
export function resolveScannedAt(
  deviceReportedAt: number | undefined,
  receivedAt: number,
  shiftStart: number,
): number {
  if (deviceReportedAt == null || !Number.isFinite(deviceReportedAt)) {
    return receivedAt;
  }
  if (deviceReportedAt > receivedAt + CLOCK_SKEW_TOLERANCE_MS) return receivedAt;
  if (deviceReportedAt < shiftStart) return shiftStart;
  return Math.min(deviceReportedAt, receivedAt);
}

export const create = internalMutation({
  args: {
    officerId: v.id("users"),
    checkpointId: v.id("checkpoints"),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    notes: v.optional(v.string()),
    /** When the phone says the scan was taken. Untrusted; clamped below. */
    capturedAt: v.optional(v.number()),
    /** The OS flagged this fix as coming from a mock location provider. */
    gpsMocked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db.get(args.checkpointId);
    if (!checkpoint) {
      throw new Error("Checkpoint not found");
    }
    const officer = await ctx.db.get(args.officerId);
    const clientId = checkpoint.clientId ?? officer?.clientId;
    const siteId = checkpoint.siteId;

    const receivedAt = Date.now();
    // Provisional. The real value needs the shift, which is loaded below, and
    // the checks in between are all "may this scan exist at all".
    let scannedAt = receivedAt;

    // A patrol scan is only real if the guard is on duty. Without an open shift
    // the scan is refused outright rather than recorded — an off-duty scan must
    // never reach a dashboard or a report as if it were patrol evidence.
    const activeShift = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.officerId).eq("status", "active"),
      )
      .first();
    if (!activeShift) {
      throw scanRefusal(
        "Scan attempted while off duty (not clocked in)",
        "You must clock in before you can scan a location.",
      );
    }

    // Now the shift is known, settle the real time of the scan.
    scannedAt = resolveScannedAt(args.capturedAt, receivedAt, activeShift.clockIn);

    // A guard may only scan checkpoints at a site they are posted to. This used
    // to run only `if (siteId)`, which meant a checkpoint carrying no site — and
    // several active ones do, left over from before the client/site structure —
    // skipped the check completely and could be scanned by any guard in the
    // system. Every path now has to produce an authorisation, and a checkpoint
    // that belongs to no site and no client cannot produce one at all: a scan
    // nobody is posted to is not patrol evidence.
    // Refusals carry both a guard-facing message and an audit detail out
    // through the exception. The audit row is written by the caller once this
    // transaction has aborted — writing it here would roll it back — and the
    // marker lets the route tell a deliberate "no" from a genuine fault, which
    // is what previously turned the geofence message into an opaque 500.
    const rejectScan = async (details: string, message: string) => {
      throw scanRefusal(details, message);
    };

    if (siteId) {
      const assigned = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId_siteId", (q) =>
          q.eq("userId", args.officerId).eq("siteId", siteId),
        )
        .first();
      if (!assigned) {
        await rejectScan(
          "Officer not assigned to this checkpoint's site",
          "Officer is not assigned to this checkpoint's site",
        );
      }
    } else if (checkpoint.clientId) {
      // Site-less but tenant-owned: the guard must at least be posted somewhere
      // under the same client.
      const assignments = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId", (q) => q.eq("userId", args.officerId))
        .collect();
      const sameClient = assignments.some(
        (a) => a.clientId === checkpoint.clientId,
      );
      if (!sameClient) {
        await rejectScan(
          "Officer not assigned to any site under this checkpoint's client",
          "Officer is not assigned to this checkpoint's client",
        );
      }
    } else {
      await rejectScan(
        "Checkpoint belongs to no site or client, so no assignment can authorise it",
        "This checkpoint is not attached to a location. Ask an admin to assign it before scanning.",
      );
    }

    // The location's own QR is where a patrol starts. A guard signs in at the
    // main entrance and only then walks the sub-locations, so a shift that
    // begins at the back fence is refused: without this, a full patrol can be
    // "completed" without anyone ever arriving at the front of the property.
    //
    // Scoped to the current shift — clocking in again means starting at the
    // entrance again. Locations created without their own QR point are exempt,
    // because there is nothing there for the guard to scan first.
    if (siteId && !checkpoint.isPrimary) {
      const siteCheckpoints = await ctx.db
        .query("checkpoints")
        .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
        .collect();
      const primary = siteCheckpoints.find((cp) => cp.isPrimary);
      if (primary) {
        const scansThisShift = await ctx.db
          .query("scans")
          .withIndex("by_officerId_scannedAt", (q) =>
            q.eq("officerId", args.officerId).gte("scannedAt", activeShift.clockIn),
          )
          .collect();
        if (!scansThisShift.some((s) => s.checkpointId === primary._id)) {
          const site = await ctx.db.get(siteId);
          await rejectScan(
            "Sub-location scanned before the location QR on this shift",
            `Start at the main entrance: scan the ${site?.name ?? "location"} QR code first, then scan this point.`,
          );
        }
      }
    }

    const recentByOfficer = await ctx.db
      .query("scans")
      .withIndex("by_officerId_scannedAt", (q) =>
        q.eq("officerId", args.officerId).gte("scannedAt", scannedAt - 60000),
      )
      .collect();
    const duplicate = recentByOfficer.find(
      (s) => s.checkpointId === args.checkpointId,
    );
    if (duplicate) {
      throw scanRefusal(
        "Duplicate scan within 60 second window",
        "You have just scanned this point. Wait a moment before scanning it again.",
      );
    }

    // GPS verification, enforced here and not in the app.
    //
    // There were two ways past this. A sub-location scan taken outside the
    // site geofence was recorded anyway, merely flagged unverified. Worse, a
    // scan carrying no coordinates at all fell straight through to
    // `gpsValid = true` — anyone able to edit the request body could mark
    // themselves verified from anywhere on earth by omitting two fields.
    //
    // Now: whichever geofence applies, the guard must be inside it, and a
    // scan with no fix is refused rather than trusted. Refusing means no scan
    // row, so a failed scan cannot reach a report, and — since post orders
    // are resolved from the stored scan — it cannot reveal a post order
    // either. The guard is told what is wrong and can simply scan again.
    // A fix the OS itself says is fabricated is not evidence of anything.
    //
    // Every other check in this function was satisfiable from a sofa: enabling
    // a mock-location app (a developer setting on Android, no root needed),
    // pointing it at the site's published coordinates and scanning a photocopy
    // of the QR. Clocked in, posted there, inside the geofence, not a duplicate
    // — all green, and the record indistinguishable from a real round.
    //
    // Refused rather than flagged, matching the no-GPS rule directly below: a
    // scan whose location is admitted fiction must not reach a client's report
    // at all. Android reports this directly; iOS never populates it, so this
    // catches the cheap attack rather than every possible one.
    if (args.gpsMocked === true) {
      await rejectScan(
        "Scan submitted with a mock GPS provider active",
        "This phone is reporting a simulated location. Turn off any mock-location or GPS-spoofing app, then scan again.",
      );
    }

    const scanSite = siteId ? await ctx.db.get(siteId) : null;
    const fence =
      checkpoint.latitude != null && checkpoint.longitude != null
        ? {
            lat: checkpoint.latitude,
            lng: checkpoint.longitude,
            radius: checkpoint.radiusMeters ?? 50,
            label: checkpoint.name,
          }
        : scanSite?.latitude != null && scanSite?.longitude != null
          ? {
              lat: scanSite.latitude,
              lng: scanSite.longitude,
              radius: scanSite.radiusMeters ?? 150,
              label: scanSite.name,
            }
          : null;

    let computedDistance: number | undefined;
    let gpsValid = false;

    if (fence) {
      if (args.gpsLatitude == null || args.gpsLongitude == null) {
        await rejectScan(
          "Scan submitted without a GPS fix",
          "Location is off or unavailable. Turn on location for this app and scan again — a patrol scan has to prove where it was taken.",
        );
      }
      computedDistance = distanceMeters(
        fence.lat,
        fence.lng,
        args.gpsLatitude!,
        args.gpsLongitude!,
      );
      gpsValid = computedDistance <= fence.radius;
      if (!gpsValid) {
        await rejectScan(
          `GPS outside the ${fence.label} geofence: ${Math.round(computedDistance)}m > ${fence.radius}m`,
          `You are ${Math.round(computedDistance)}m away from ${fence.label}. Move within ${fence.radius}m of it and scan again.`,
        );
      }
    } else {
      // No geofence exists to check against. Blocking here would make a
      // whole location unscannable over an admin's missing map pin, so the
      // scan is kept but never counted as verified, and audited so the
      // misconfiguration is visible rather than silent.
      await ctx.runMutation(internal.audit.record, {
        action: "scan.unverified",
        actorId: args.officerId,
        actorRole: officer?.role ?? "guard",
        targetType: "checkpoint",
        targetId: args.checkpointId,
        details:
          "Scan could not be GPS-verified: neither the sub-location nor its location has map coordinates",
        clientId,
        siteId,
        success: true,
      });
    }

    const scanId = await ctx.db.insert("scans", {
      clientId,
      siteId,
      officerId: args.officerId,
      checkpointId: args.checkpointId,
      shiftId: activeShift._id,
      scannedAt,
      // Was `receivedAt: scannedAt`, which made the two identical on every row
      // and quietly removed the only signal that a scan had been held back.
      receivedAt,
      deviceReportedAt: args.capturedAt,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      gpsMocked: args.gpsMocked,
      gpsValid,
      distanceMeters: computedDistance,
      notes: args.notes ?? "",
      postOrdersRequired: false,
      workflowStatus: "completed",
    });

    const triggeredPostOrders = await postOrdersTriggeredByScan(
      ctx,
      args.checkpointId,
      siteId,
      args.officerId,
    );
    const requiredPostOrders = triggeredPostOrders.filter(
      (order) => order.requiresAcknowledgement,
    );
    if (requiredPostOrders.length > 0) {
      await ctx.db.patch(scanId, {
        postOrdersRequired: true,
        workflowStatus: "pending_post_order_ack",
      });
    }

    // No officerPositions row is written here. The scan itself already stores
    // gpsLatitude/gpsLongitude/scannedAt, and the on-duty tracker records the
    // guard's position independently — inserting a third copy of the same fix
    // only inflated the largest table in the system.

    const recentScans = await ctx.db
      .query("scans")
      .withIndex("by_officerId_scannedAt", (q) =>
        q.eq("officerId", args.officerId).gte("scannedAt", scannedAt - 300000),
      )
      .collect();
    if (recentScans.length > 10) {
      await ctx.runMutation(internal.audit.record, {
        action: "scan.suspicious",
        actorId: args.officerId,
        actorRole: officer?.role ?? "guard",
        targetType: "scan",
        targetId: scanId,
        details: `Officer submitted ${recentScans.length} scans in the last 5 minutes`,
        clientId,
        siteId,
        success: true,
      });
    }

    await ctx.runMutation(internal.activity.record, {
      clientId,
      siteId,
      checkpointId: args.checkpointId,
      officerId: args.officerId,
      activityType: "patrol_scan",
      sourceTable: "scans",
      sourceId: scanId,
      locationLabel: checkpoint.name,
      activityLabel: `Patrol scan: ${checkpoint.name}`,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      gpsValid,
      distanceMeters: computedDistance,
      occurredAt: scannedAt,
    });

    await ctx.runMutation(internal.audit.record, {
      action: "scan.submitted",
      actorId: args.officerId,
      actorRole: officer?.role ?? "guard",
      targetType: "scan",
      targetId: scanId,
      details: requiredPostOrders.length
        ? `Scan submitted; ${requiredPostOrders.length} checkpoint post order(s) require acknowledgement`
        : "Scan submitted",
      clientId,
      siteId,
      success: true,
    });

    const openAlert = await ctx.db
      .query("missedPatrolAlerts")
      .withIndex("by_checkpointId_status", (q) =>
        q.eq("checkpointId", args.checkpointId).eq("status", "open"),
      )
      .first();
    if (openAlert) {
      await ctx.db.patch(openAlert._id, {
        status: "resolved",
        // The scan time, not now: this is the moment the gap actually closed.
        resolvedAt: scannedAt,
        notificationStatus: openAlert.notificationStatus || "resolved_by_scan",
      });
    }

    return {
      id: scanId,
      officerId: officer?.legacyId ?? officer?._id ?? "",
      officerName: officer?.name ?? "",
      checkpointId: checkpoint.legacyId ?? checkpoint._id,
      checkpointName: checkpoint.name,
      checkpointCode: checkpoint.code,
      scannedAt: new Date(scannedAt).toISOString(),
      receivedAt: new Date(scannedAt).toISOString(),
      gpsLatitude: args.gpsLatitude ?? 0,
      gpsLongitude: args.gpsLongitude ?? 0,
      gpsValid,
      distanceMeters: computedDistance ?? 0,
      notes: args.notes ?? "",
      postOrdersRequired: requiredPostOrders.length > 0,
      workflowStatus:
        requiredPostOrders.length > 0 ? "pending_post_order_ack" : "completed",
      // The duties triggered by THIS scan (sub-location + whole-location
      // orders) so the app can pop them up immediately after a successful
      // scan without re-deriving the match client-side.
      postOrders: triggeredPostOrders.map((order) => ({
        id: order.legacyId ?? order._id,
        title: order.title,
        summary: order.summary,
        instructions: order.instructions,
        priority: order.priority,
        active: order.active,
        requiresAcknowledgement: order.requiresAcknowledgement,
        requiresPhotoProof: order.requiresPhotoProof,
      })),
    };
  },
});

// Every active post order a scan at this point puts in front of THIS guard:
// orders pinned to the exact sub-location plus orders covering the whole
// location (siteId set, no checkpointId of their own). An order posted to
// specific guards only reaches those guards; one with no named guard is
// general duty and reaches whoever scans.
async function postOrdersTriggeredByScan(
  ctx: { db: any },
  checkpointId: Id<"checkpoints">,
  siteId?: Id<"sites">,
  officerId?: Id<"users">,
) {
  const forCheckpoint = await ctx.db
    .query("postOrders")
    .withIndex("by_checkpointId", (q: any) => q.eq("checkpointId", checkpointId))
    .collect();
  const forSite = siteId
    ? (
        await ctx.db
          .query("postOrders")
          .withIndex("by_siteId", (q: any) => q.eq("siteId", siteId))
          .collect()
      ).filter((order: any) => !order.checkpointId)
    : [];
  return [...forCheckpoint, ...forSite].filter((order: any) => {
    if (!order.active) return false;
    if (!officerId) return true;
    const guardIds: string[] =
      order.assignedUserIds && order.assignedUserIds.length
        ? order.assignedUserIds
        : order.assignedUserId
          ? [order.assignedUserId]
          : [];
    return guardIds.length === 0 || guardIds.includes(officerId);
  });
}

export const acknowledgePostOrdersForScan = internalMutation({
  args: {
    scanId: v.id("scans"),
    userId: v.id("users"),
    postOrderIds: v.array(v.id("postOrders")),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) throw new Error("Scan not found");
    if (scan.officerId !== args.userId) {
      throw new Error("Only the scanning officer can acknowledge this scan");
    }

    const officer = await ctx.db.get(args.userId);
    const activeShift = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
    const requiredOrders = await postOrdersTriggeredByScan(
      ctx,
      scan.checkpointId,
      scan.siteId,
      args.userId,
    );
    const requiredIds = requiredOrders
      .filter((order) => order.requiresAcknowledgement)
      .map((order) => order._id);
    const submitted = new Set(args.postOrderIds);
    const missing = requiredIds.filter((id) => !submitted.has(id));
    if (missing.length > 0) {
      throw new Error("All checkpoint post orders must be acknowledged");
    }

    const now = Date.now();
    const existingForScan = await ctx.db
      .query("scanPostOrderAcknowledgements")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .collect();
    const created = [];

    for (const postOrderId of requiredIds) {
      if (
        existingForScan.some(
          (ack) => ack.postOrderId === postOrderId && ack.userId === args.userId,
        )
      ) {
        continue;
      }

      const acknowledgementId = await ctx.db.insert(
        "scanPostOrderAcknowledgements",
        {
          scanId: args.scanId,
          postOrderId,
          checkpointId: scan.checkpointId,
          userId: args.userId,
          shiftId: activeShift?._id,
          acknowledgedAt: now,
          clientId: scan.clientId,
          siteId: scan.siteId,
        },
      );
      created.push(acknowledgementId);

      await ctx.db.insert("postOrderCompletions", {
        clientId: scan.clientId,
        siteId: scan.siteId,
        postOrderId,
        userId: args.userId,
        shiftId: activeShift?._id,
        checkpointId: scan.checkpointId,
        status: "acknowledged",
        acknowledgedAt: now,
        proofNote: "",
        reviewStatus: "pending",
        reviewNote: "",
        createdAt: now,
      });

      await ctx.runMutation(internal.activity.record, {
        clientId: scan.clientId,
        siteId: scan.siteId,
        checkpointId: scan.checkpointId,
        officerId: args.userId,
        activityType: "post_order_ack",
        sourceTable: "scanPostOrderAcknowledgements",
        sourceId: acknowledgementId,
        activityLabel: "Checkpoint post order acknowledged",
        occurredAt: now,
      });
    }

    await ctx.db.patch(args.scanId, {
      postOrdersAcknowledgedAt: now,
      workflowStatus: "completed",
    });

    await ctx.runMutation(internal.audit.record, {
      action: "scan.acknowledged",
      actorId: args.userId,
      actorRole: officer?.role ?? "guard",
      targetType: "scan",
      targetId: args.scanId,
      details: `Acknowledged ${requiredIds.length} checkpoint post order(s)`,
      clientId: scan.clientId,
      siteId: scan.siteId,
      success: true,
    });
    await ctx.runMutation(internal.audit.record, {
      action: "post_order.acknowledged",
      actorId: args.userId,
      actorRole: officer?.role ?? "guard",
      targetType: "scan",
      targetId: args.scanId,
      details: `Stored checkpoint post order acknowledgement for scan ${args.scanId}`,
      clientId: scan.clientId,
      siteId: scan.siteId,
      success: true,
    });

    return {
      scanId: args.scanId,
      acknowledgedAt: new Date(now).toISOString(),
      count: requiredIds.length,
      created,
    };
  },
});

export const listPostOrderAcknowledgements = internalQuery({
  args: {
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let acknowledgements = args.userId
      ? await ctx.db
          .query("scanPostOrderAcknowledgements")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId!))
          .order("desc")
          .take(args.limit ?? 200)
      : await ctx.db
          .query("scanPostOrderAcknowledgements")
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
    const checkpoints = await ctx.db.query("checkpoints").collect();
    // A scan outlives the guard who took it and the QR point it was taken at,
    // so fall back to the tombstone name rather than showing the record blank.
    const [goneOfficers, goneCheckpoints] = await Promise.all([
      deletedNamesByType(ctx, "user"),
      deletedNamesByType(ctx, "checkpoint"),
    ]);
    const orders = await ctx.db.query("postOrders").collect();
    return acknowledgements.map((ack) => ({
      id: ack._id,
      scanId: ack.scanId,
      postOrderId: ack.postOrderId,
      postOrderTitle:
        orders.find((order) => order._id === ack.postOrderId)?.title ?? "",
      checkpointId: ack.checkpointId,
      checkpointName:
        checkpoints.find((checkpoint) => checkpoint._id === ack.checkpointId)
          ?.name ??
        goneCheckpoints.get(ack.checkpointId) ??
        "",
      userId: ack.userId,
      userName:
        users.find((user) => user._id === ack.userId)?.name ??
        goneOfficers.get(ack.userId) ??
        "",
      acknowledgedAt: new Date(ack.acknowledgedAt).toISOString(),
      clientId: ack.clientId ?? null,
      siteId: ack.siteId ?? null,
    }));
  },
});
