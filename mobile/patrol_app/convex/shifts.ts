import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getActiveForUser = query({
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

export const getStatusForUser = query({
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

export const listForExport = query({
  args: {},
  handler: async (ctx) => {
    const shifts = await ctx.db.query("shifts").collect();
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

export const listAll = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    let shifts = await ctx.db.query("shifts").order("desc").collect();
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
    return shifts.map((s) => ({
      id: s.legacyId ?? s._id,
      userId: s.userId,
      userName: users.find((u) => u._id === s.userId)?.name ?? "",
      clockIn: new Date(s.clockIn).toISOString(),
      clockOut: s.clockOut ? new Date(s.clockOut).toISOString() : null,
      status: s.status,
      siteLabel: s.siteLabel,
      createdAt: new Date(s.createdAt).toISOString(),
    }));
  },
});

export const missingClockins = query({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const shifts = await ctx.db.query("shifts").collect();
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

export const clockIn = mutation({
  args: {
    userId: v.id("users"),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    siteLabel: v.optional(v.string()),
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
    const shiftId = await ctx.db.insert("shifts", {
      clientId: user?.clientId,
      siteId: assignment?.siteId,
      userId: args.userId,
      status: "active",
      clockIn: now,
      clockInPhoto: "",
      clockInLatitude: args.latitude,
      clockInLongitude: args.longitude,
      siteLabel: args.siteLabel ?? "",
      createdAt: now,
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

export const clockOut = mutation({
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
    await ctx.db.patch(args.shiftId, {
      status: "completed",
      clockOut: clockOutAt,
      clockOutLatitude: args.latitude,
      clockOutLongitude: args.longitude,
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
