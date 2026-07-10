import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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

async function validateSiteGeofence(
  ctx: MutationCtx,
  siteId: Id<"sites"> | undefined,
  latitude?: number,
  longitude?: number,
) {
  if (!siteId || latitude == null || longitude == null) {
    return { gpsValid: false, distanceMeters: undefined as number | undefined };
  }
  // Prefer the site's own geofence when it has coordinates; fall back to the
  // nearest checkpoint that still carries its own coordinates (legacy data).
  // Sub-locations without coordinates can't anchor a geofence.
  const site = await ctx.db.get(siteId);
  if (site?.latitude != null && site?.longitude != null) {
    const distance = distanceMeters(site.latitude, site.longitude, latitude, longitude);
    return {
      gpsValid: distance <= (site.radiusMeters ?? 150),
      distanceMeters: distance,
    };
  }
  const checkpoints = await ctx.db
    .query("checkpoints")
    .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
    .collect();
  const distances = checkpoints
    .filter((cp) => cp.latitude != null && cp.longitude != null)
    .map((checkpoint) => ({
      distance: distanceMeters(
        checkpoint.latitude!,
        checkpoint.longitude!,
        latitude,
        longitude,
      ),
      radius: checkpoint.radiusMeters ?? 50,
    }));
  if (distances.length === 0) {
    return { gpsValid: true, distanceMeters: undefined as number | undefined };
  }
  const nearest = distances.sort((a, b) => a.distance - b.distance)[0];
  return {
    gpsValid: nearest.distance <= nearest.radius,
    distanceMeters: nearest.distance,
  };
}

export const getActiveForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
  },
});

export const getStatusForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const shift = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();

    if (!shift) {
      return {
        active: false,
        shift: null,
      };
    }

    return {
      active: true,
      shift: {
        id: shift.legacyId ?? shift._id,
        clockIn: new Date(shift.clockIn).toISOString(),
        clockOut: shift.clockOut
          ? new Date(shift.clockOut).toISOString()
          : null,
        scheduledEnd: shift.scheduledEnd
          ? new Date(shift.scheduledEnd).toISOString()
          : null,
        siteLabel: shift.siteLabel,
        status: shift.status,
      },
    };
  },
});

export const listForExport = internalQuery({
  args: {},
  handler: async (ctx) => {
    const shifts = await ctx.db.query("shifts").order("desc").take(500);
    const users = await ctx.db.query("users").collect();
    return shifts.map((shift) => ({
      id: shift.legacyId ?? shift._id,
      userId: shift.userId,
      userName: users.find((user) => user._id === shift.userId)?.name ?? "",
      clockIn: new Date(shift.clockIn).toISOString(),
      clockOut: shift.clockOut ? new Date(shift.clockOut).toISOString() : null,
      status: shift.status,
      siteLabel: shift.siteLabel,
      createdAt: new Date(shift.createdAt).toISOString(),
    }));
  },
});

export const listAll = internalQuery({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const query = args.clientId
      ? ctx.db.query("shifts").withIndex("by_clientId", (q) =>
          q.eq("clientId", args.clientId),
        )
      : ctx.db.query("shifts");
    let shifts = await query.order("desc").take(200);
    if (args.userId) shifts = shifts.filter((s) => s.userId === args.userId);
    if (args.startDate)
      shifts = shifts.filter((s) => s.clockIn >= args.startDate!);
    if (args.endDate) shifts = shifts.filter((s) => s.clockIn <= args.endDate!);
    if (args.clientId) {
      const clientUsers = await ctx.db.query("users").collect();
      const clientUserIds = new Set(
        clientUsers
          .filter((u) => u.clientId === args.clientId)
          .map((u) => u._id),
      );
      shifts = shifts.filter(
        (s) => s.clientId === args.clientId || clientUserIds.has(s.userId),
      );
    }
    const users = await ctx.db.query("users").collect();
    return shifts.map((s) => {
      const u = users.find((u) => u._id === s.userId);
      return {
        id: s.legacyId ?? s._id,
        userId: s.userId,
        userName: u?.name ?? "",
        userEmail: u?.email ?? "",
        userPhone: u?.phone ?? "",
        clockIn: new Date(s.clockIn).toISOString(),
        clockOut: s.clockOut ? new Date(s.clockOut).toISOString() : null,
        status: s.status,
        siteLabel: s.siteLabel,
        clockInPhoto: s.clockInPhoto ?? "",
        // Real GPS data captured at clock-in / clock-out so the web can show
        // the exact location (and whether it was inside the geofence).
        clockInLatitude: s.clockInLatitude ?? null,
        clockInLongitude: s.clockInLongitude ?? null,
        clockInGpsValid: s.clockInGpsValid ?? null,
        clockInDistanceMeters: s.clockInDistanceMeters ?? null,
        clockOutLatitude: s.clockOutLatitude ?? null,
        clockOutLongitude: s.clockOutLongitude ?? null,
        clockOutGpsValid: s.clockOutGpsValid ?? null,
        clockOutDistanceMeters: s.clockOutDistanceMeters ?? null,
        createdAt: new Date(s.createdAt).toISOString(),
      };
    });
  },
});

export const missingClockins = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const shifts = await ctx.db.query("shifts").order("desc").take(500);
    const todayShifts = shifts.filter((s) => s.clockIn >= todayStart.getTime());
    const activeUsers = users.filter(
      (u) => u.active && (!args.clientId || u.clientId === args.clientId),
    );
    return activeUsers
      .filter((u) => !todayShifts.some((s) => s.userId === u._id))
      .map((u) => ({
        userId: u.legacyId ?? u._id,
        name: u.name,
        email: u.email,
        role: u.role,
      }));
  },
});

export const clockIn = internalMutation({
  args: {
    userId: v.id("users"),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    siteLabel: v.optional(v.string()),
    clockInPhoto: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
    if (existing) {
      throw new Error("Already clocked in — end current shift first");
    }
    const now = Date.now();
    const user = await ctx.db.get(args.userId);
    const assignment = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    const geofence = await validateSiteGeofence(
      ctx,
      assignment?.siteId,
      args.latitude,
      args.longitude,
    );
    const shiftId = await ctx.db.insert("shifts", {
      clientId: user?.clientId,
      siteId: assignment?.siteId,
      userId: args.userId,
      status: "active",
      clockIn: now,
      clockInPhoto: args.clockInPhoto ?? "",
      clockInLatitude: args.latitude,
      clockInLongitude: args.longitude,
      clockInGpsValid: geofence.gpsValid,
      clockInDistanceMeters: geofence.distanceMeters,
      siteLabel: args.siteLabel ?? "",
      createdAt: now,
    });

    await ctx.runMutation(internal.activity.record, {
      clientId: user?.clientId,
      siteId: assignment?.siteId,
      officerId: args.userId,
      activityType: "clock_in",
      sourceTable: "shifts",
      sourceId: shiftId,
      siteName: args.siteLabel ?? "",
      activityLabel: "Clock-in",
      gpsLatitude: args.latitude,
      gpsLongitude: args.longitude,
      gpsValid: geofence.gpsValid,
      distanceMeters: geofence.distanceMeters,
      occurredAt: now,
    });

    return {
      active: true,
      shift: {
        id: shiftId,
        clockIn: new Date(now).toISOString(),
        clockOut: null,
        scheduledEnd: null,
        siteLabel: args.siteLabel ?? "",
        status: "active",
      },
    };
  },
});

export const clockOut = internalMutation({
  args: {
    shiftId: v.id("shifts"),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.shiftId);
    if (!existing) {
      throw new Error("Shift not found");
    }

    const clockOutAt = Date.now();
    const geofence = await validateSiteGeofence(
      ctx,
      existing.siteId,
      args.latitude,
      args.longitude,
    );
    await ctx.db.patch(args.shiftId, {
      status: "completed",
      clockOut: clockOutAt,
      clockOutLatitude: args.latitude,
      clockOutLongitude: args.longitude,
      clockOutGpsValid: geofence.gpsValid,
      clockOutDistanceMeters: geofence.distanceMeters,
    });

    await ctx.runMutation(internal.activity.record, {
      clientId: existing.clientId,
      siteId: existing.siteId,
      officerId: existing.userId,
      activityType: "clock_out",
      sourceTable: "shifts",
      sourceId: args.shiftId,
      siteName: existing.siteLabel,
      activityLabel: "Clock-out",
      gpsLatitude: args.latitude,
      gpsLongitude: args.longitude,
      gpsValid: geofence.gpsValid,
      distanceMeters: geofence.distanceMeters,
      occurredAt: clockOutAt,
    });

    const updated = await ctx.db.get(args.shiftId);
    return {
      active: false,
      shift: updated
        ? {
            id: updated.legacyId ?? updated._id,
            clockIn: new Date(updated.clockIn).toISOString(),
            clockOut: new Date(clockOutAt).toISOString(),
            scheduledEnd: updated.scheduledEnd
              ? new Date(updated.scheduledEnd).toISOString()
              : null,
            siteLabel: updated.siteLabel,
            status: updated.status,
          }
        : null,
    };
  },
});
