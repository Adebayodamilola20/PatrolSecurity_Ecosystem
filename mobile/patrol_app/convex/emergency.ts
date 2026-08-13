import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const trigger = internalMutation({
  args: {
    userId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    siteId: v.optional(v.id("sites")),
    siteLabel: v.optional(v.string()),
    category: v.optional(v.string()),
    note: v.optional(v.string()),
    location: v.optional(v.string()),
    source: v.optional(v.union(v.literal("guard"), v.literal("client"))),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;
    const siteId = checkpoint?.siteId ?? args.siteId;
    const site = siteId ? await ctx.db.get(siteId) : null;
    const source = args.source ?? "guard";

    // A client account can only raise an emergency on its own property.
    // The route resolves whatever site id it is handed; it does not own it.
    if (source === "client") {
      const owner = checkpoint?.clientId ?? site?.clientId;
      if (!user?.clientId || !owner || owner !== user.clientId) {
        throw new Error("That location does not belong to your account");
      }
    }

    const when = new Date().toISOString();
    const where = args.location || args.siteLabel || site?.name || "Unknown location";
    const message =
      source === "client"
        ? `Emergency raised by ${user?.name ?? "the client"} at ${where}. Guards on site must respond immediately.`
        : `Emergency alert from ${user?.name ?? "officer"} at ${where}. Immediate response required.`;
    const triggeredAt = Date.now();
    const id = await ctx.db.insert("emergencyEvents", {
      clientId: checkpoint?.clientId ?? site?.clientId ?? user?.clientId,
      siteId,
      userId: args.userId,
      checkpointId: args.checkpointId,
      siteLabel: args.siteLabel || site?.name || "",
      category: args.category,
      message,
      note: args.note ?? "",
      source,
      triggeredAt,
      emailRecipients: [],
      phoneRecipients: [],
      status: "triggered",
      deliveryPayload: {},
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: checkpoint?.clientId ?? site?.clientId ?? user?.clientId,
      siteId,
      checkpointId: args.checkpointId,
      officerId: args.userId,
      activityType: "emergency",
      sourceTable: "emergencyEvents",
      sourceId: id,
      siteName: args.siteLabel || site?.name || "",
      locationLabel: where,
      activityLabel: `Emergency: ${args.category ?? "Other"}`,
      occurredAt: triggeredAt,
    });
    return {
      id,
      userId: args.userId,
      checkpointId: args.checkpointId ?? null,
      siteId: siteId ?? null,
      siteLabel: args.siteLabel || site?.name || "",
      message,
      note: args.note ?? "",
      source,
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
    return await describeEvents(ctx, events);
  },
});

/**
 * Everything the control room needs on the card, resolved here rather than
 * left to the dashboard to look up.
 *
 * At 2am nobody wants to click through to find out whose site this is or what
 * number to ring — the guard's phone number in particular was missing, so an
 * alert arrived with no way to call the person who raised it.
 */
async function describeEvents(
  ctx: { db: any },
  events: Array<Record<string, any>>,
) {
  const users = await ctx.db.query("users").collect();
  const sites = await ctx.db.query("sites").collect();
  const clients = await ctx.db.query("clients").collect();
  const checkpoints = await ctx.db.query("checkpoints").collect();
  return events.map((event) => {
    const raiser = users.find((user: any) => user._id === event.userId);
    return {
      id: event.legacyId ?? event._id,
      category: event.category ?? "Other",
      message: event.message,
      // The reason the button was pressed, in the words of whoever pressed it.
      note: event.note,
      reason: event.note || event.category || "Not stated",
      status: event.status,
      source: event.source ?? "guard",
      siteLabel: event.siteLabel,
      siteId: event.siteId ?? null,
      siteName: sites.find((s: any) => s._id === event.siteId)?.name ?? event.siteLabel,
      clientId: event.clientId ?? null,
      clientName: clients.find((c: any) => c._id === event.clientId)?.name ?? null,
      checkpointId: event.checkpointId ?? null,
      checkpointName:
        checkpoints.find((c: any) => c._id === event.checkpointId)?.name ?? null,
      userId: event.userId,
      officerName: raiser?.name ?? "",
      officerPhone: raiser?.phone ?? "",
      officerRole: raiser?.role ?? null,
      triggeredAt: new Date(event.triggeredAt).toISOString(),
    };
  });
}

/**
 * What a guard is shown: live emergencies at the locations they are posted to.
 *
 * This is how a client-raised alarm reaches the people who can actually walk
 * to it. A guard sees nothing from any other company's sites.
 */
export const listForGuard = internalQuery({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const siteIds = new Set(assignments.map((a) => a.siteId));
    if (siteIds.size === 0) return [];

    const events = (
      await ctx.db
        .query("emergencyEvents")
        .withIndex("by_triggeredAt")
        .order("desc")
        .take(args.limit ?? 50)
    ).filter(
      (event) =>
        event.status !== "resolved" &&
        event.status !== "closed" &&
        event.siteId &&
        siteIds.has(event.siteId),
    );
    return await describeEvents(ctx, events);
  },
});

/** Staff close one out once it has been dealt with. */
export const resolve = internalMutation({
  args: { eventId: v.id("emergencyEvents"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Emergency not found");
    if (event.status === "resolved") return { alreadyResolved: true };
    await ctx.db.patch(args.eventId, { status: "resolved" });
    return { alreadyResolved: false };
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
