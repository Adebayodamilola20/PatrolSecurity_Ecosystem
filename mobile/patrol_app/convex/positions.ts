import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { distanceMeters } from "./lib/geo";
import {
  getPositionMaxIntervalMs,
  getPositionMinDistanceMeters,
  getPositionRetentionDays,
} from "./env";

export const record = internalMutation({
  args: {
    userId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    speed: v.optional(v.number()),
    heading: v.optional(v.number()),
    capturedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const capturedAt = args.capturedAt ?? Date.now();

    // Movement gate. The phone reports every 30s whether or not the guard moved,
    // which for a static post is ~2,880 near-identical rows a day. Keep a point
    // only when it carries information: real movement, or enough time elapsed
    // that we still want a proof-of-presence heartbeat.
    const previous = await ctx.db
      .query("officerPositions")
      .withIndex("by_userId_capturedAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    if (previous) {
      const moved = distanceMeters(
        previous.latitude,
        previous.longitude,
        args.latitude,
        args.longitude,
      );
      const elapsed = capturedAt - previous.capturedAt;
      if (
        moved < getPositionMinDistanceMeters() &&
        elapsed < getPositionMaxIntervalMs()
      ) {
        return { status: "skipped", reason: "stationary", movedMeters: moved };
      }
    }

    const user = await ctx.db.get(args.userId);
    const assignment = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    await ctx.db.insert("officerPositions", {
      clientId: user?.clientId,
      siteId: assignment?.siteId,
      userId: args.userId,
      latitude: args.latitude,
      longitude: args.longitude,
      accuracy: args.accuracy,
      speed: args.speed,
      heading: args.heading,
      capturedAt,
    });
    return { status: "ok" };
  },
});

// Deleting a whole retention window in one transaction would breach the
// mutation limits once this table is large, so the purge walks it in bounded
// batches and reschedules itself until a pass comes back short.
const PURGE_BATCH_SIZE = 512;

export const purgeOldPositions = internalMutation({
  args: { cutoff: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // The cutoff is resolved on the first pass and then carried through the
    // follow-ups, so a long purge can't drift as wall-clock time advances.
    const cutoff =
      args.cutoff ??
      Date.now() - getPositionRetentionDays() * 24 * 60 * 60 * 1000;

    const stale = await ctx.db
      .query("officerPositions")
      .withIndex("by_capturedAt", (q) => q.lt("capturedAt", cutoff))
      .take(PURGE_BATCH_SIZE);

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    if (stale.length === PURGE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.positions.purgeOldPositions, {
        cutoff,
      });
    }

    return {
      deleted: stale.length,
      cutoff,
      done: stale.length < PURGE_BATCH_SIZE,
    };
  },
});
