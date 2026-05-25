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
        clockOut: shift.clockOut ? new Date(shift.clockOut).toISOString() : null,
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

export const clockIn = mutation({
  args: {
    userId: v.id("users"),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    siteLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const shiftId = await ctx.db.insert("shifts", {
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
