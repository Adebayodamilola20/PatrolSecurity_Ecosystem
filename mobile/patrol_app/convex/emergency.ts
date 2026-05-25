import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const trigger = mutation({
  args: {
    userId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    siteLabel: v.optional(v.string()),
    note: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const when = new Date().toISOString();
    const where = args.location || args.siteLabel || "Unknown location";
    const message = `Emergency alert from ${user?.name ?? "officer"} at ${where}. Immediate response required.`;
    const id = await ctx.db.insert("emergencyEvents", {
      userId: args.userId,
      checkpointId: args.checkpointId,
      siteLabel: args.siteLabel ?? "",
      message,
      note: args.note ?? "",
      triggeredAt: Date.now(),
      emailRecipients: [],
      phoneRecipients: [],
      status: "triggered",
      deliveryPayload: {},
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

export const recordDelivery = mutation({
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
