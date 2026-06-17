import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const trigger = internalMutation({
  args: {
    userId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    siteLabel: v.optional(v.string()),
    category: v.optional(v.string()),
    note: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;
    const when = new Date().toISOString();
    const where = args.location || args.siteLabel || "Unknown location";
    const message = `Emergency alert from ${user?.name ?? "officer"} at ${where}. Immediate response required.`;
    const triggeredAt = Date.now();
    const id = await ctx.db.insert("emergencyEvents", {
      clientId: checkpoint?.clientId ?? user?.clientId,
      siteId: checkpoint?.siteId,
      userId: args.userId,
      checkpointId: args.checkpointId,
      siteLabel: args.siteLabel ?? "",
      category: args.category,
      message,
      note: args.note ?? "",
      triggeredAt,
      emailRecipients: [],
      phoneRecipients: [],
      status: "triggered",
      deliveryPayload: {},
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: checkpoint?.clientId ?? user?.clientId,
      siteId: checkpoint?.siteId,
      checkpointId: args.checkpointId,
      officerId: args.userId,
      activityType: "emergency",
      sourceTable: "emergencyEvents",
      sourceId: id,
      siteName: args.siteLabel ?? "",
      locationLabel: where,
      activityLabel: `Emergency: ${args.category ?? "Other"}`,
      occurredAt: triggeredAt,
    });
    return {
      id,
      userId: args.userId,
      checkpointId: args.checkpointId ?? null,
      siteLabel: args.siteLabel ?? "",
      message,
      note: args.note ?? "",
      triggeredAt: when,
      emailRecipients: [],
      phoneRecipients: [],
      status: "triggered",
      delivery: {},
    };
  },
});

export const listActive = internalQuery({
  args: {
    clientId: v.optional(v.id("clients")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db
      .query("emergencyEvents")
      .withIndex("by_triggeredAt")
      .order("desc")
      .take(args.limit ?? 100);
    events = events.filter(
      (event) =>
        event.status !== "resolved" &&
        event.status !== "closed" &&
        (!args.clientId || event.clientId === args.clientId),
    );
    const users = await ctx.db.query("users").collect();
    return events.map((event) => ({
      id: event.legacyId ?? event._id,
      category: event.category ?? "Other",
      message: event.message,
      note: event.note,
      status: event.status,
      siteLabel: event.siteLabel,
      userId: event.userId,
      officerName: users.find((user) => user._id === event.userId)?.name ?? "",
      triggeredAt: new Date(event.triggeredAt).toISOString(),
      clientId: event.clientId ?? null,
      siteId: event.siteId ?? null,
      checkpointId: event.checkpointId ?? null,
    }));
  },
});

export const recordDelivery = internalMutation({
  args: {
    eventId: v.id("emergencyEvents"),
    emailRecipients: v.array(v.string()),
    phoneRecipients: v.array(v.string()),
    status: v.string(),
    deliveryPayload: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      emailRecipients: args.emailRecipients,
      phoneRecipients: args.phoneRecipients,
      status: args.status,
      deliveryPayload: args.deliveryPayload,
    });
    return await ctx.db.get(args.eventId);
  },
});
