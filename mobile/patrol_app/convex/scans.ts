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
        gpsLatitude: scan.gpsLatitude ?? 0,
        gpsLongitude: scan.gpsLongitude ?? 0,
        gpsValid: scan.gpsValid,
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
    const all = await ctx.db.query("scans").collect();
    return all.find(s => s._id === args.id)?._id ?? null;
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

export const create = internalMutation({
  args: {
    officerId: v.id("users"),
    checkpointId: v.id("checkpoints"),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db.get(args.checkpointId);
    if (!checkpoint) {
      throw new Error("Checkpoint not found");
    }
    const officer = await ctx.db.get(args.officerId);
    const clientId = checkpoint.clientId ?? officer?.clientId;
    const siteId = checkpoint.siteId;

    const scannedAt = Date.now();

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
      await ctx.runMutation(internal.audit.record, {
        action: "scan.rejected",
        actorId: args.officerId,
        actorRole: officer?.role ?? "guard",
        targetType: "checkpoint",
        targetId: args.checkpointId,
        details: "Scan attempted while off duty (not clocked in)",
        clientId,
        siteId,
        success: false,
      });
      throw new Error("Officer must clock in before scanning");
    }

    // A guard may only scan checkpoints at a site they are posted to. This used
    // to run only `if (siteId)`, which meant a checkpoint carrying no site — and
    // several active ones do, left over from before the client/site structure —
    // skipped the check completely and could be scanned by any guard in the
    // system. Every path now has to produce an authorisation, and a checkpoint
    // that belongs to no site and no client cannot produce one at all: a scan
    // nobody is posted to is not patrol evidence.
    const rejectScan = async (details: string, message: string) => {
      await ctx.runMutation(internal.audit.record, {
        action: "scan.rejected",
        actorId: args.officerId,
        actorRole: officer?.role ?? "guard",
        targetType: "checkpoint",
        targetId: args.checkpointId,
        details,
        clientId,
        siteId,
        success: false,
      });
      throw new Error(message);
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
      await ctx.runMutation(internal.audit.record, {
        action: "scan.rejected",
        actorId: args.officerId,
        actorRole: officer?.role ?? "guard",
        targetType: "checkpoint",
        targetId: args.checkpointId,
        details: "Duplicate scan within 60 second window",
        clientId,
        siteId,
        success: false,
      });
      throw new Error("Duplicate scan within 60 seconds");
    }

    let computedDistance: number | undefined;
    let gpsValid = true;

    if (args.gpsLatitude != null && args.gpsLongitude != null) {
      if (checkpoint.latitude != null && checkpoint.longitude != null) {
        // Legacy checkpoint with its own coordinates: enforce as before.
        computedDistance = distanceMeters(
          checkpoint.latitude,
          checkpoint.longitude,
          args.gpsLatitude,
          args.gpsLongitude,
        );
        gpsValid = computedDistance <= (checkpoint.radiusMeters ?? 50);
        if (!gpsValid) {
          await ctx.runMutation(internal.audit.record, {
            action: "scan.rejected",
            actorId: args.officerId,
            actorRole: officer?.role ?? "guard",
            targetType: "checkpoint",
            targetId: args.checkpointId,
            details: `GPS out of radius: ${computedDistance}m > ${checkpoint.radiusMeters ?? 50}m`,
            clientId,
            siteId,
            success: false,
          });
          throw new Error(
            "GPS location is outside the allowed radius for this checkpoint",
          );
        }
      } else {
        // Sub-location (plain QR, no coordinates of its own): verify the
        // guard's GPS against the parent site geofence. The scan is recorded
        // either way — out-of-range only flags it as unverified so staff see
        // the evidence instead of the scan silently never existing.
        const site = siteId ? await ctx.db.get(siteId) : null;
        if (site?.latitude != null && site?.longitude != null) {
          computedDistance = distanceMeters(
            site.latitude,
            site.longitude,
            args.gpsLatitude,
            args.gpsLongitude,
          );
          gpsValid = computedDistance <= (site.radiusMeters ?? 150);
          if (!gpsValid) {
            await ctx.runMutation(internal.audit.record, {
              action: "scan.unverified",
              actorId: args.officerId,
              actorRole: officer?.role ?? "guard",
              targetType: "checkpoint",
              targetId: args.checkpointId,
              details: `Sub-location scan outside site geofence: ${Math.round(computedDistance)}m > ${site.radiusMeters ?? 150}m from ${site.name}`,
              clientId,
              siteId,
              success: true,
            });
          }
        }
        // Site without coordinates: nothing to verify against — scan-only.
      }
    }

    const scanId = await ctx.db.insert("scans", {
      clientId,
      siteId,
      officerId: args.officerId,
      checkpointId: args.checkpointId,
      shiftId: activeShift._id,
      scannedAt,
      receivedAt: scannedAt,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
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
