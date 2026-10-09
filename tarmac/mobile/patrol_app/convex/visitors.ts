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
      ? ctx.db.query("visitorLogs").withIndex("by_siteId", (q) => q.eq("siteId", args.siteId!))
      : args.officerId
        ? ctx.db.query("visitorLogs").withIndex("by_officerId", (q) => q.eq("officerId", args.officerId!))
        : args.clientId
          ? ctx.db.query("visitorLogs").withIndex("by_clientId", (q) => q.eq("clientId", args.clientId!))
          : ctx.db.query("visitorLogs");
    let logs = await query.order("desc").take(args.limit ?? 100);
    // The index above is only a way of reading rows efficiently — it is not the
    // authorization. Choosing it by `siteId` first meant a caller who supplied
    // ?siteId= took a branch where neither the officer pin nor the tenant pin
    // was ever applied, and this table carries third-party PII: visitor names,
    // phone numbers, ID numbers and plates. Every filter is re-applied here so
    // no combination of parameters can skip one.
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
      visitorName: l.visitorName,
      visitorPhone: l.visitorPhone,
      hostName: l.hostName,
      purpose: l.purpose,
      vehiclePlate: l.vehiclePlate,
      idNumber: l.idNumber,
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
      .query("visitorLogs")
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
    visitorName: v.string(),
    visitorPhone: v.string(),
    hostName: v.string(),
    purpose: v.string(),
    vehiclePlate: v.string(),
    idNumber: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const officer = await ctx.db.get(args.officerId);
    const id = await ctx.db.insert("visitorLogs", {
      clientId: args.clientId,
      siteId: args.siteId,
      officerId: args.officerId,
      visitorName: args.visitorName,
      visitorPhone: args.visitorPhone,
      hostName: args.hostName,
      purpose: args.purpose,
      vehiclePlate: args.vehiclePlate,
      idNumber: args.idNumber,
      checkInAt: now,
      status: "active",
      notes: args.notes ?? "",
      createdAt: now,
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: args.clientId,
      siteId: args.siteId,
      officerId: args.officerId,
      activityType: "visitor_check_in",
      sourceTable: "visitorLogs",
      sourceId: id,
      activityLabel: `Visitor check-in: ${args.visitorName}`,
      occurredAt: now,
    });
    await ctx.runMutation(internal.audit.record, {
      action: "visitor.check_in",
      actorId: args.officerId,
      actorRole: officer?.role ?? "guard",
      targetType: "visitor_log",
      targetId: id,
      details: `Visitor check-in: ${args.visitorName}`,
      clientId: args.clientId,
      siteId: args.siteId,
      success: true,
    });
    return { id, checkInAt: new Date(now).toISOString() };
  },
});

export const checkOut = internalMutation({
  args: {
    logId: v.id("visitorLogs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) throw new Error("Visitor log not found");
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
      activityType: "visitor_check_out",
      sourceTable: "visitorLogs",
      sourceId: args.logId,
      activityLabel: `Visitor check-out: ${log.visitorName}`,
      occurredAt: now,
    });
    await ctx.runMutation(internal.audit.record, {
      action: "visitor.check_out",
      actorId: args.userId,
      actorRole: actor?.role ?? "guard",
      targetType: "visitor_log",
      targetId: args.logId,
      details: `Visitor check-out: ${log.visitorName}`,
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
    const all = await ctx.db.query("visitorLogs").collect();
    return all.find((l) => l.legacyId === args.id || l._id === args.id)?._id ?? null;
  },
});
