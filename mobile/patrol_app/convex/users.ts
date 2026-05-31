import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const findByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const getSafeProfile = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.active) {
      return null;
    }

    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const client = user.clientId ? await ctx.db.get(user.clientId) : null;

    return {
      id: user.legacyId ?? user._id,
      convexId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      active: user.active,
      clientId: user.clientId,
      clientName: client?.name ?? null,
      liveTracking: user.liveTracking,
      siteIds: assignments.map((assignment) => assignment.siteId),
    };
  },
});

export const listAll = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let users = await ctx.db.query("users").collect()
    if (args.clientId) users = users.filter(u => u.clientId === args.clientId)
    return Promise.all(users.map(async (u) => {
      const client = u.clientId ? await ctx.db.get(u.clientId) : null
      const shifts = await ctx.db
        .query("shifts")
        .withIndex("by_userId", (q) => q.eq("userId", u._id))
        .collect()
      const activeShift = shifts.find((s) => s.status === "active")
      const lastClockInShift = shifts
        .filter((s) => s.clockIn)
        .sort((a, b) => b.clockIn - a.clockIn)[0]
      const lastClockOutShift = shifts
        .filter((s) => s.clockOut)
        .sort((a, b) => (b.clockOut ?? 0) - (a.clockOut ?? 0))[0]
      return {
        id: u.legacyId ?? u._id,
        convexId: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone,
        active: u.active,
        clientId: u.clientId,
        clientName: client?.name ?? null,
        liveTracking: u.liveTracking,
        createdAt: new Date(u.createdAt).toISOString(),
        onDuty: !!activeShift,
        lastClockIn: lastClockInShift?.clockIn ? new Date(lastClockInShift.clockIn).toISOString() : null,
        lastClockOut: lastClockOutShift?.clockOut ? new Date(lastClockOutShift.clockOut).toISOString() : null,
      }
    }))
  },
});

export const getById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.userId);
    if (!u) return null;
    const client = u.clientId ? await ctx.db.get(u.clientId) : null;
    return { id: u.legacyId ?? u._id, convexId: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, active: u.active, clientId: u.clientId, clientName: client?.name ?? null, liveTracking: u.liveTracking, createdAt: new Date(u.createdAt).toISOString() };
  },
});

export const create = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("main_account"), v.literal("supervisor"), v.literal("guard")),
    phone: v.string(),
    active: v.boolean(),
    clientId: v.optional(v.id("clients")),
    liveTracking: v.boolean(),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("users", args);
    return id;
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("users")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) return byLegacyId._id;
    const all = await ctx.db.query("users").collect();
    return all.find(u => u._id === args.id)?._id ?? null;
  },
});

export const getDetail = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const found = await ctx.db.get(args.userId);
    if (!found) return null;
    const client = found.clientId ? await ctx.db.get(found.clientId) : null;
    const shifts = await ctx.db
      .query("shifts")
      .withIndex("by_userId", (q) => q.eq("userId", found._id))
      .order("desc")
      .take(20);
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_officerId", (q) => q.eq("officerId", found._id))
      .order("desc")
      .take(20);
    const activeShift = shifts.find((s) => s.status === "active");
    const onDuty = !!activeShift;
    const lastClockInShift = shifts
      .filter((s) => s.clockIn)
      .sort((a, b) => b.clockIn - a.clockIn)[0];
    const lastClockOutShift = shifts
      .filter((s) => s.clockOut)
      .sort((a, b) => (b.clockOut ?? 0) - (a.clockOut ?? 0))[0];
    return {
      id: found.legacyId ?? found._id,
      convexId: found._id,
      name: found.name,
      email: found.email,
      role: found.role,
      phone: found.phone,
      active: found.active,
      clientId: found.clientId,
      clientName: client?.name ?? null,
      liveTracking: found.liveTracking,
      createdAt: new Date(found.createdAt).toISOString(),
      onDuty,
      lastClockIn: lastClockInShift?.clockIn ? new Date(lastClockInShift.clockIn).toISOString() : null,
      lastClockOut: lastClockOutShift?.clockOut ? new Date(lastClockOutShift.clockOut).toISOString() : null,
      shifts: shifts.map((s) => ({
        id: s.legacyId ?? s._id,
        clockIn: s.clockIn ? new Date(s.clockIn).toISOString() : null,
        clockOut: s.clockOut ? new Date(s.clockOut).toISOString() : null,
        status: s.status,
        scheduledStart: s.scheduledStart ? new Date(s.scheduledStart).toISOString() : null,
        scheduledEnd: s.scheduledEnd ? new Date(s.scheduledEnd).toISOString() : null,
        createdAt: new Date(s.createdAt).toISOString(),
      })),
      scans: scans.map((s) => ({
        id: s.legacyId ?? s._id,
        checkpointId: s.checkpointId,
        checkpointName: checkpoints.find((c) => c._id === s.checkpointId)?.name ?? "",
        checkpointCode: checkpoints.find((c) => c._id === s.checkpointId)?.code ?? "",
        scannedAt: new Date(s.scannedAt).toISOString(),
        receivedAt: new Date(s.receivedAt).toISOString(),
        gpsLatitude: s.gpsLatitude,
        gpsLongitude: s.gpsLongitude,
        gpsValid: s.gpsValid,
        distanceMeters: s.distanceMeters,
        notes: s.notes,
        checkpointActive: checkpoints.find((c) => c._id === s.checkpointId)?.active ?? true,
      })),
    };
  },
});

export const changePassword = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
    });
  },
});
