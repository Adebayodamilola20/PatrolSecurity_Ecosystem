import { mutation, query } from "./_generated/server";
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

export const list = query({
  args: {
    officerId: v.optional(v.id("users")),
    checkpointId: v.optional(v.id("checkpoints")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let scans = await ctx.db.query("scans").order("desc").collect();

    if (args.officerId) {
      scans = scans.filter((scan) => scan.officerId === args.officerId);
    }
    if (args.checkpointId) {
      scans = scans.filter((scan) => scan.checkpointId === args.checkpointId);
    }

    return scans.slice(0, args.limit ?? 100);
  },
});

export const listForApi = query({
  args: {
    officerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    let scans = await ctx.db.query("scans").order("desc").collect();

    if (args.officerId) {
      scans = scans.filter((scan) => scan.officerId === args.officerId);
    }

    if (args.clientId) {
      const clientCheckpoints = await ctx.db.query("checkpoints").collect();
      const cpIds = new Set(clientCheckpoints.filter(cp => cp.clientId === args.clientId).map(cp => cp._id));
      scans = scans.filter(scan => cpIds.has(scan.checkpointId));
    }

    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();

    return scans.slice(0, args.limit ?? 100).map((scan) => {
      const officer = users.find((user) => user._id === scan.officerId);
      const checkpoint = checkpoints.find(
        (item) => item._id === scan.checkpointId,
      );

      return {
        id: scan.legacyId ?? scan._id,
        officerId: officer?.legacyId ?? officer?._id ?? "",
        officerName: officer?.name ?? "",
        checkpointId: checkpoint?.legacyId ?? checkpoint?._id ?? "",
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

export const getRecent = query({
  args: { limit: v.optional(v.number()), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let scans = await ctx.db.query("scans").order("desc").collect();
    if (args.clientId) {
      const cps = await ctx.db.query("checkpoints").collect();
      const cpIds = new Set(cps.filter(cp => cp.clientId === args.clientId).map(cp => cp._id));
      scans = scans.filter(s => cpIds.has(s.checkpointId));
    }
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    return scans.slice(0, args.limit ?? 50).map(s => ({
      id: s.legacyId ?? s._id, officerId: s.officerId,
      officerName: users.find(u => u._id === s.officerId)?.name ?? "",
      checkpointId: s.checkpointId,
      checkpointName: checkpoints.find(c => c._id === s.checkpointId)?.name ?? "",
      scannedAt: new Date(s.scannedAt).toISOString(),
      gpsLatitude: s.gpsLatitude, gpsLongitude: s.gpsLongitude,
      gpsValid: s.gpsValid, distanceMeters: s.distanceMeters,
    }));
  },
});

export const getById = query({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.scanId);
    if (!s) return null;
    const users = await ctx.db.query("users").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();
    return {
      id: s.legacyId ?? s._id, officerId: s.officerId,
      officerName: users.find(u => u._id === s.officerId)?.name ?? "",
      checkpointId: s.checkpointId,
      checkpointName: checkpoints.find(c => c._id === s.checkpointId)?.name ?? "",
      checkpointCode: checkpoints.find(c => c._id === s.checkpointId)?.code ?? "",
      scannedAt: new Date(s.scannedAt).toISOString(),
      receivedAt: new Date(s.receivedAt).toISOString(),
      gpsLatitude: s.gpsLatitude, gpsLongitude: s.gpsLongitude,
      gpsValid: s.gpsValid, distanceMeters: s.distanceMeters, notes: s.notes,
    };
  },
});

export const create = mutation({
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

    const scannedAt = Date.now();
    let computedDistance: number | undefined;
    let gpsValid = true;

    if (args.gpsLatitude != null && args.gpsLongitude != null) {
      computedDistance = distanceMeters(
        checkpoint.latitude,
        checkpoint.longitude,
        args.gpsLatitude,
        args.gpsLongitude,
      );
      gpsValid = computedDistance <= Math.min(checkpoint.radiusMeters, 10);
    }

    const scanId = await ctx.db.insert("scans", {
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

    const officer = await ctx.db.get(args.officerId);
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
