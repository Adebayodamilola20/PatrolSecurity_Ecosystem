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

// One-off backfill: existing scans/shifts predate the activity-event recording,
// so siteActivityEvents is empty. Regenerate events from historical data.
// Idempotent: skips events that already exist (keyed by sourceTable+sourceId+type).
export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("siteActivityEvents").collect();
    const seen = new Set(
      existing.map((e) => `${e.sourceTable}:${e.sourceId}:${e.activityType}`),
    );

    const users = await ctx.db.query("users").collect();
    const userById = new Map(users.map((u) => [u._id, u]));
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const checkpointById = new Map(checkpoints.map((c) => [c._id, c]));

    let created = 0;
    const insert = async (event: {
      sourceTable: string;
      sourceId: string;
      activityType: any;
      officerId: any;
      clientId?: any;
      siteId?: any;
      checkpointId?: any;
      siteName?: string;
      locationLabel?: string;
      activityLabel: string;
      gpsLatitude?: number;
      gpsLongitude?: number;
      gpsValid?: boolean;
      distanceMeters?: number;
      occurredAt: number;
    }) => {
      const key = `${event.sourceTable}:${event.sourceId}:${event.activityType}`;
      if (seen.has(key)) return;
      seen.add(key);
      const now = Date.now();
      await ctx.db.insert("siteActivityEvents", {
        clientId: event.clientId,
        siteId: event.siteId,
        checkpointId: event.checkpointId,
        officerId: event.officerId,
        activityType: event.activityType,
        sourceTable: event.sourceTable,
        sourceId: event.sourceId,
        siteName: event.siteName ?? "",
        locationLabel: event.locationLabel ?? "",
        activityLabel: event.activityLabel,
        gpsLatitude: event.gpsLatitude,
        gpsLongitude: event.gpsLongitude,
        gpsValid: event.gpsValid,
        distanceMeters: event.distanceMeters,
        count: 1,
        occurredAt: event.occurredAt,
        createdAt: now,
      });
      created++;
    };

    // Scans -> patrol_scan
    const scans = await ctx.db.query("scans").collect();
    for (const scan of scans) {
      const checkpoint = checkpointById.get(scan.checkpointId);
      const officer = userById.get(scan.officerId);
      await insert({
        sourceTable: "scans",
        sourceId: scan._id,
        activityType: "patrol_scan",
        officerId: scan.officerId,
        clientId: checkpoint?.clientId ?? officer?.clientId,
        siteId: checkpoint?.siteId,
        checkpointId: scan.checkpointId,
        locationLabel: checkpoint?.name ?? "",
        activityLabel: `Patrol scan: ${checkpoint?.name ?? "checkpoint"}`,
        gpsLatitude: scan.gpsLatitude,
        gpsLongitude: scan.gpsLongitude,
        gpsValid: scan.gpsValid,
        distanceMeters: scan.distanceMeters,
        occurredAt: scan.scannedAt ?? scan._creationTime,
      });
    }

    // Shifts -> clock_in (+ clock_out if completed)
    const shifts = await ctx.db.query("shifts").collect();
    for (const shift of shifts) {
      const officer = userById.get(shift.userId);
      const clientId = shift.clientId ?? officer?.clientId;
      await insert({
        sourceTable: "shifts",
        sourceId: shift._id,
        activityType: "clock_in",
        officerId: shift.userId,
        clientId,
        siteId: shift.siteId,
        siteName: shift.siteLabel ?? "",
        activityLabel: "Clock-in",
        gpsLatitude: shift.clockInLatitude,
        gpsLongitude: shift.clockInLongitude,
        gpsValid: shift.clockInGpsValid,
        distanceMeters: shift.clockInDistanceMeters,
        occurredAt: shift.clockIn ?? shift._creationTime,
      });
      if (shift.clockOut) {
        await insert({
          sourceTable: "shifts",
          sourceId: shift._id,
          activityType: "clock_out",
          officerId: shift.userId,
          clientId,
          siteId: shift.siteId,
          siteName: shift.siteLabel ?? "",
          activityLabel: "Clock-out",
          gpsLatitude: shift.clockOutLatitude,
          gpsLongitude: shift.clockOutLongitude,
          gpsValid: shift.clockOutGpsValid,
          distanceMeters: shift.clockOutDistanceMeters,
          occurredAt: shift.clockOut,
        });
      }
    }

    return { created, total: seen.size };
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
