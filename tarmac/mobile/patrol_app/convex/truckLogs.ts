import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const listForApi = internalQuery({
  args: {
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    officerId: v.optional(v.id("users")),
    status: v.optional(v.union(v.literal("active"), v.literal("completed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = args.siteId
      ? ctx.db.query("truckLogs").withIndex("by_siteId", (q) => q.eq("siteId", args.siteId!))
      : args.officerId
        ? ctx.db.query("truckLogs").withIndex("by_officerId", (q) => q.eq("officerId", args.officerId!))
        : args.clientId
          ? ctx.db.query("truckLogs").withIndex("by_clientId", (q) => q.eq("clientId", args.clientId!))
          : ctx.db.query("truckLogs");
    let logs = await query.order("desc").take(args.limit ?? 100);
    // See visitors.listForApi: the index is a read strategy, not the
    // authorization. Supplying ?siteId= used to take a branch that applied
    // neither the officer nor the tenant pin, exposing another company's
    // gate traffic — drivers, plates, haulage firms and cargo.
    if (args.siteId) logs = logs.filter((l) => l.siteId === args.siteId);
    if (args.officerId) logs = logs.filter((l) => l.officerId === args.officerId);
    if (args.clientId) logs = logs.filter((l) => l.clientId === args.clientId);
    if (args.status) logs = logs.filter((l) => l.status === args.status);
    const users = await ctx.db.query("users").collect();
    return logs.map((l) => ({
      id: l.legacyId ?? l._id,
      clientId: l.clientId ?? null,
      siteId: l.siteId ?? null,
      officerId: l.officerId,
      officerName: users.find((u) => u._id === l.officerId)?.name ?? "",
      driverName: l.driverName,
      plateNumber: l.plateNumber,
      company: l.company,
      purpose: l.purpose,
      cargoDescription: l.cargoDescription,
      checkInAt: new Date(l.checkInAt).toISOString(),
      checkOutAt: l.checkOutAt ? new Date(l.checkOutAt).toISOString() : null,
      status: l.status,
      notes: l.notes,
      createdAt: new Date(l.createdAt).toISOString(),
    }));
  },
});

export const listActiveForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("truckLogs")
      .withIndex("by_officerId", (q) => q.eq("officerId", args.userId))
      .order("desc")
      .take(50);
    return logs.filter((l) => l.status === "active");
  },
});

export const checkIn = internalMutation({
  args: {
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    officerId: v.id("users"),
    driverName: v.string(),
    plateNumber: v.string(),
    company: v.string(),
    purpose: v.string(),
    cargoDescription: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const officer = await ctx.db.get(args.officerId);
    const id = await ctx.db.insert("truckLogs", {
      clientId: args.clientId,
      siteId: args.siteId,
      officerId: args.officerId,
      driverName: args.driverName,
      plateNumber: args.plateNumber,
      company: args.company,
      purpose: args.purpose,
      cargoDescription: args.cargoDescription,
      checkInAt: now,
      status: "active",
      notes: args.notes ?? "",
      createdAt: now,
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: args.clientId,
      siteId: args.siteId,
      officerId: args.officerId,
      activityType: "truck_check_in",
      sourceTable: "truckLogs",
      sourceId: id,
      activityLabel: `Truck check-in: ${args.driverName} (${args.plateNumber})`,
      occurredAt: now,
    });
    await ctx.runMutation(internal.audit.record, {
      action: "truck.check_in",
      actorId: args.officerId,
      actorRole: officer?.role ?? "guard",
      targetType: "truck_log",
      targetId: id,
      details: `Truck check-in: ${args.driverName} (${args.plateNumber})`,
      clientId: args.clientId,
      siteId: args.siteId,
      success: true,
    });
    return { id, checkInAt: new Date(now).toISOString() };
  },
});

export const checkOut = internalMutation({
  args: {
    logId: v.id("truckLogs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) throw new Error("Truck log not found");
    if (log.status === "completed") throw new Error("Already checked out");
    if (log.officerId !== args.userId) {
      const user = await ctx.db.get(args.userId);
      if (user?.role !== "admin" && user?.role !== "main_account") {
        throw new Error("Only the recording officer or admin can check out");
      }
    }
    const now = Date.now();
    const actor = await ctx.db.get(args.userId);
    await ctx.db.patch(args.logId, {
      status: "completed",
      checkOutAt: now,
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: log.clientId,
      siteId: log.siteId,
      officerId: args.userId,
      activityType: "truck_check_out",
      sourceTable: "truckLogs",
      sourceId: args.logId,
      activityLabel: `Truck check-out: ${log.driverName} (${log.plateNumber})`,
      occurredAt: now,
    });
    await ctx.runMutation(internal.audit.record, {
      action: "truck.check_out",
      actorId: args.userId,
      actorRole: actor?.role ?? "guard",
      targetType: "truck_log",
      targetId: args.logId,
      details: `Truck check-out: ${log.driverName} (${log.plateNumber})`,
      clientId: log.clientId,
      siteId: log.siteId,
      success: true,
    });
    return { checkedOut: true };
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("truckLogs").collect();
    return all.find((l) => l.legacyId === args.id || l._id === args.id)?._id ?? null;
  },
});
