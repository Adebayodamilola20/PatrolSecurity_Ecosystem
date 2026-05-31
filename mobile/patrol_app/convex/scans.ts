import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadius = 6371000;
  const dLat = ((latitudeB - latitudeA) * Math.PI) / 180;
  const dLon = ((longitudeB - longitudeA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latitudeA * Math.PI) / 180) *
      Math.cos((latitudeB * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

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
    limit: v.optional(v.number()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const query = args.officerId
      ? ctx.db.query("scans").withIndex("by_officerId_scannedAt", (q) =>
          q.eq("officerId", args.officerId!),
        )
      : args.clientId
        ? ctx.db.query("scans").withIndex("by_clientId", (q) =>
            q.eq("clientId", args.clientId!),
          )
        : ctx.db.query("scans");
    let scans = await query.order("desc").take(args.limit ?? 100);

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

    return scans.map((scan) => {
      const officer = users.find((user) => user._id === scan.officerId);
      const checkpoint = checkpoints.find(
        (item) => item._id === scan.checkpointId,
      );

      return {
        id: scan.legacyId ?? scan._id,
        officerId: officer?.legacyId ?? officer?._id ?? "",
        officerConvexId: scan.officerId,
        officerName: officer?.name ?? "",
        checkpointId: checkpoint?.legacyId ?? checkpoint?._id ?? "",
        checkpointConvexId: scan.checkpointId,
        checkpointName: checkpoint?.name ?? "",
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
    return scans.map((s) => ({
      id: s.legacyId ?? s._id,
      officerId: s.officerId,
      officerName: users.find((u) => u._id === s.officerId)?.name ?? "",
      checkpointId: s.checkpointId,
      checkpointName:
        checkpoints.find((c) => c._id === s.checkpointId)?.name ?? "",
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
    return {
      id: scan.legacyId ?? scan._id,
      officerId: scan.officerId,
      officerName: users.find(u => u._id === scan.officerId)?.name ?? "",
      checkpointId: scan.checkpointId,
      checkpointName: checkpoints.find(c => c._id === scan.checkpointId)?.name ?? "",
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
    return {
      id: s.legacyId ?? s._id,
      officerId: s.officerId,
      officerName: users.find((u) => u._id === s.officerId)?.name ?? "",
      checkpointId: s.checkpointId,
      checkpointName:
        checkpoints.find((c) => c._id === s.checkpointId)?.name ?? "",
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

    if (siteId) {
      const assigned = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId_siteId", (q) =>
          q.eq("userId", args.officerId).eq("siteId", siteId),
        )
        .first();
      if (!assigned) {
        await ctx.runMutation(internal.audit.record, {
          action: "scan.rejected",
          actorId: args.officerId,
          actorRole: officer?.role ?? "guard",
          targetType: "checkpoint",
          targetId: args.checkpointId,
          details: "Officer not assigned to this checkpoint's site",
          clientId,
          siteId,
          success: false,
        });
        throw new Error("Officer is not assigned to this checkpoint's site");
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
      computedDistance = distanceMeters(
        checkpoint.latitude,
        checkpoint.longitude,
        args.gpsLatitude,
        args.gpsLongitude,
      );
      gpsValid = computedDistance <= checkpoint.radiusMeters;
      if (!gpsValid) {
        await ctx.runMutation(internal.audit.record, {
          action: "scan.rejected",
          actorId: args.officerId,
          actorRole: officer?.role ?? "guard",
          targetType: "checkpoint",
          targetId: args.checkpointId,
          details: `GPS out of radius: ${computedDistance}m > ${checkpoint.radiusMeters}m`,
          clientId,
          siteId,
          success: false,
        });
        throw new Error(
          "GPS location is outside the allowed radius for this checkpoint",
        );
      }
    }

    const scanId = await ctx.db.insert("scans", {
      clientId,
      siteId,
      officerId: args.officerId,
      checkpointId: args.checkpointId,
      scannedAt,
      receivedAt: scannedAt,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      gpsValid,
      distanceMeters: computedDistance,
      notes: args.notes ?? "",
    });

    if (args.gpsLatitude != null && args.gpsLongitude != null) {
      await ctx.db.insert("officerPositions", {
        clientId,
        siteId,
        userId: args.officerId,
        latitude: args.gpsLatitude,
        longitude: args.gpsLongitude,
        capturedAt: scannedAt,
      });
    }

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
    };
  },
});
