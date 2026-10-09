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
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    gpsAccuracyMeters: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;

    // Where they are, worked out here rather than taken from the app.
    //
    // A panic press usually happens nowhere near a QR code, so there is no
    // checkpoint to derive a site from and the app sends an empty siteLabel.
    // That reached the control room as "Site: Unknown site" for a guard who
    // was plainly posted somewhere — useless in the one message that has to
    // be right. Fall back to the shift they are on, then to the location they
    // are posted to.
    const source = args.source ?? "guard";

    // [tenant-isolation] A guard cannot pin an alarm to somebody else's site.
    //
    // The checkpointId and siteId arrive in the request body and decide which
    // company and location the CODE RED is filed against — it reaches that
    // client's portal, their guards' phones and the control room as an incident
    // at their property. Only the client path was ever checked, so a guard
    // could raise a false emergency at a site they have no connection to.
    //
    // Deliberately *ignored* rather than refused: this is a panic button, and
    // the one thing worse than a misattributed alarm is a suppressed one. A
    // location the guard is not posted to is dropped and the fallbacks below
    // resolve where they actually are, so the alert always goes out — it just
    // goes out against the truth.
    let requestedSiteId = checkpoint?.siteId ?? args.siteId;
    let ownedCheckpoint = checkpoint;
    if (requestedSiteId && source === "guard" && user?.role === "guard") {
      const posted = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId_siteId", (q) =>
          q.eq("userId", args.userId).eq("siteId", requestedSiteId!),
        )
        .first();
      if (!posted) {
        requestedSiteId = undefined;
        // Drop the checkpoint too. It is what the clientId is derived from
        // below, so keeping it would file the alarm against the wrong company
        // even after the site had been discarded.
        ownedCheckpoint = null;
      }
    }

    let siteId = requestedSiteId;
    if (!siteId) {
      const activeShift = await ctx.db
        .query("shifts")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", args.userId).eq("status", "active"),
        )
        .first();
      siteId = activeShift?.siteId;
    }
    if (!siteId) {
      const posting = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .first();
      siteId = posting?.siteId;
    }
    const site = siteId ? await ctx.db.get(siteId) : null;

    // A client account can only raise an emergency on its own property.
    // The route resolves whatever site id it is handed; it does not own it.
    if (source === "client") {
      const owner = ownedCheckpoint?.clientId ?? site?.clientId;
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
      clientId: ownedCheckpoint?.clientId ?? site?.clientId ?? user?.clientId,
      siteId,
      userId: args.userId,
      checkpointId: ownedCheckpoint?._id,
      siteLabel: args.siteLabel || site?.name || "",
      category: args.category,
      message,
      note: args.note ?? "",
      source,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      gpsAccuracyMeters: args.gpsAccuracyMeters,
      triggeredAt,
      emailRecipients: [],
      phoneRecipients: [],
      status: "triggered",
      deliveryPayload: {},
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: ownedCheckpoint?.clientId ?? site?.clientId ?? user?.clientId,
      siteId,
      checkpointId: ownedCheckpoint?._id,
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
      checkpointId: ownedCheckpoint?._id ?? null,
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
/** The lifecycle a human moves an alert through, in order. */
const LIFECYCLE = ["triggered", "acknowledged", "responding", "resolved"] as const;

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
      // Rows written before delivery got its own column have an outcome like
      // "delivered" sitting in `status`. That never meant a human had picked
      // the alert up, so it reads as untouched — which is what it was.
      status: LIFECYCLE.includes(event.status) ? event.status : "triggered",
      deliveryStatus:
        event.deliveryStatus ??
        (LIFECYCLE.includes(event.status) ? null : (event.status ?? null)),
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
      gpsLatitude: event.gpsLatitude ?? null,
      gpsLongitude: event.gpsLongitude ?? null,
      gpsAccuracyMeters: event.gpsAccuracyMeters ?? null,
      // Who has it, and how far along. An alert nobody owns is the failure
      // this is here to make visible.
      acknowledgedAt: event.acknowledgedAt
        ? new Date(event.acknowledgedAt).toISOString()
        : null,
      acknowledgedByName: event.acknowledgedByUserId
        ? (users.find((u: any) => u._id === event.acknowledgedByUserId)?.name ?? "")
        : null,
      respondingAt: event.respondingAt
        ? new Date(event.respondingAt).toISOString()
        : null,
      respondingByName: event.respondingByUserId
        ? (users.find((u: any) => u._id === event.respondingByUserId)?.name ?? "")
        : null,
      resolvedAt: event.resolvedAt ? new Date(event.resolvedAt).toISOString() : null,
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

/**
 * Move an emergency along its lifecycle: triggered → acknowledged →
 * responding → resolved.
 *
 * Forward only. Marking something resolved and then "acknowledged" again
 * would leave the control room unable to tell whether anyone is still on
 * their way, so a backwards move is refused rather than silently applied.
 * Each step records who moved it and when — an alert nobody owns is the
 * failure mode this is here to prevent.
 */

export const setStatus = internalMutation({
  args: {
    eventId: v.id("emergencyEvents"),
    userId: v.id("users"),
    status: v.union(
      v.literal("acknowledged"),
      v.literal("responding"),
      v.literal("resolved"),
    ),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Emergency not found");

    const currentIndex = LIFECYCLE.indexOf(event.status as (typeof LIFECYCLE)[number]);
    const nextIndex = LIFECYCLE.indexOf(args.status);
    // An unrecognised existing status (older rows) is treated as the start.
    const from = currentIndex === -1 ? 0 : currentIndex;
    if (nextIndex === from) return { unchanged: true, status: event.status };
    if (nextIndex < from) {
      throw new Error(
        `This emergency is already ${event.status}; it cannot go back to ${args.status}`,
      );
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "acknowledged") {
      patch.acknowledgedAt = now;
      patch.acknowledgedByUserId = args.userId;
    } else if (args.status === "responding") {
      patch.respondingAt = now;
      patch.respondingByUserId = args.userId;
      // Skipping straight to responding still means somebody saw it.
      if (!event.acknowledgedAt) {
        patch.acknowledgedAt = now;
        patch.acknowledgedByUserId = args.userId;
      }
    } else {
      patch.resolvedAt = now;
      patch.resolvedByUserId = args.userId;
      if (!event.acknowledgedAt) {
        patch.acknowledgedAt = now;
        patch.acknowledgedByUserId = args.userId;
      }
    }
    await ctx.db.patch(args.eventId, patch);
    return { unchanged: false, status: args.status };
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
    // Deliberately does NOT touch `status`. Whether the SMS went out and
    // whether a human is responding are different questions, and writing the
    // first into the second lost the answer to both: the card read DELIVERED
    // for an alert nobody had seen.
    await ctx.db.patch(args.eventId, {
      emailRecipients: args.emailRecipients,
      phoneRecipients: args.phoneRecipients,
      deliveryStatus: args.status,
      deliveryPayload: args.deliveryPayload,
    });
    return await ctx.db.get(args.eventId);
  },
});
