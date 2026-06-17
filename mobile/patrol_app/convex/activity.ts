import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const activityType = v.union(
  v.literal("clock_in"),
  v.literal("clock_out"),
  v.literal("patrol_scan"),
  v.literal("incident"),
  v.literal("maintenance"),
  v.literal("dar"),
  v.literal("emergency"),
  v.literal("pass_on_log_ack"),
  v.literal("post_order_ack"),
  v.literal("visitor_check_in"),
  v.literal("visitor_check_out"),
  v.literal("truck_check_in"),
  v.literal("truck_check_out"),
);

export const record = internalMutation({
  args: {
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    checkpointId: v.optional(v.id("checkpoints")),
    officerId: v.id("users"),
    activityType,
    sourceTable: v.string(),
    sourceId: v.string(),
    siteName: v.optional(v.string()),
    locationLabel: v.optional(v.string()),
    activityLabel: v.string(),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    gpsValid: v.optional(v.boolean()),
    distanceMeters: v.optional(v.number()),
    count: v.optional(v.number()),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const site = args.siteId ? await ctx.db.get(args.siteId) : null;
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;
    const now = Date.now();

    return await ctx.db.insert("siteActivityEvents", {
      clientId: args.clientId ?? site?.clientId,
      siteId: args.siteId,
      checkpointId: args.checkpointId,
      officerId: args.officerId,
      activityType: args.activityType,
      sourceTable: args.sourceTable,
      sourceId: args.sourceId,
      siteName: args.siteName ?? site?.name ?? "",
      locationLabel: args.locationLabel ?? checkpoint?.name ?? site?.location ?? "",
      activityLabel: args.activityLabel,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      gpsValid: args.gpsValid,
      distanceMeters: args.distanceMeters,
      count: args.count ?? 1,
      occurredAt: args.occurredAt ?? now,
      createdAt: now,
    });
  },
});

export const list = internalQuery({
  args: {
    officerId: v.optional(v.id("users")),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    activityType: v.optional(activityType),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = args.siteId
      ? ctx.db
          .query("siteActivityEvents")
          .withIndex("by_siteId_and_occurredAt", (q) =>
            q.eq("siteId", args.siteId!),
          )
      : args.clientId
        ? ctx.db
            .query("siteActivityEvents")
            .withIndex("by_clientId_and_occurredAt", (q) =>
              q.eq("clientId", args.clientId!),
            )
        : args.officerId
          ? ctx.db
              .query("siteActivityEvents")
              .withIndex("by_officerId_and_occurredAt", (q) =>
                q.eq("officerId", args.officerId!),
              )
          : args.activityType
            ? ctx.db
                .query("siteActivityEvents")
                .withIndex("by_activityType_and_occurredAt", (q) =>
                  q.eq("activityType", args.activityType!),
                )
            : ctx.db.query("siteActivityEvents");

    let events = await query.order("desc").take(args.limit ?? 500);
    if (args.officerId) {
      events = events.filter((event) => event.officerId === args.officerId);
    }
    if (args.clientId) {
      events = events.filter((event) => event.clientId === args.clientId);
    }
    if (args.siteId) {
      events = events.filter((event) => event.siteId === args.siteId);
    }
    if (args.activityType) {
      events = events.filter((event) => event.activityType === args.activityType);
    }
    if (args.startDate) {
      events = events.filter((event) => event.occurredAt >= args.startDate!);
    }
    if (args.endDate) {
      events = events.filter((event) => event.occurredAt <= args.endDate!);
    }

    const users = await ctx.db.query("users").collect();
    const clients = await ctx.db.query("clients").collect();
    return events.map((event) => {
      const officer = users.find((user) => user._id === event.officerId);
      const client = event.clientId
        ? clients.find((item) => item._id === event.clientId)
        : null;
      return {
        id: event._id,
        clientId: event.clientId ?? null,
        clientName: client?.name ?? "",
        siteId: event.siteId ?? null,
        site: event.siteName,
        location: event.locationLabel,
        activityType: event.activityType,
        activity: event.activityLabel,
        date: new Date(event.occurredAt).toISOString().slice(0, 10),
        time: new Date(event.occurredAt).toISOString(),
        officerId: event.officerId,
        officer: officer?.name ?? "",
        count: event.count,
        gpsLatitude: event.gpsLatitude ?? null,
        gpsLongitude: event.gpsLongitude ?? null,
        gpsValid: event.gpsValid ?? null,
        distanceMeters: event.distanceMeters ?? null,
        sourceTable: event.sourceTable,
        sourceId: event.sourceId,
        occurredAt: new Date(event.occurredAt).toISOString(),
        createdAt: new Date(event.createdAt).toISOString(),
      };
    });
  },
});
