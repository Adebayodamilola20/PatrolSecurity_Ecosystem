import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ---------------------------------------------------------------------------
// Request protection: per-actor rate limiting + global load shedding.
//
// Two independent controls, both backed by the indexed `rateLimits` counter
// table (O(1) per check — no table scans):
//
//   1. Per-actor rate limit — a fixed-window counter keyed by
//      `<action>:<actorId>:<windowStart>`. Stops a single guard/IP/client from
//      flooding one endpoint. Limits are per action (see `limits` below).
//
//   2. Global load shedding — a system-wide budget of requests per second
//      across ALL actors. When the service is collectively overloaded (a
//      thundering herd, a runaway client, an attack) excess requests are shed
//      with 503 regardless of who sent them, so the deployment stays up for
//      everyone instead of falling over. The global counter is SHARDED across
//      GLOBAL_SHARDS rows to avoid a single hot document serialising every
//      write (which would amplify load under exactly the conditions we're
//      trying to survive).
//
// `guard` runs both checks in one transactional mutation and only increments
// the counters when the request is admitted, so a rejected request never
// consumes budget.
// ---------------------------------------------------------------------------

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

// Per-actor limits, by action. Tuned for a security-patrol workload: GPS
// position pings are frequent (a guard reports every few seconds), scans are
// bursty, emergencies are rare and must never be throttled into uselessness.
const limits: Record<string, RateLimitConfig> = {
  login: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  // Keyed by IP alone, on top of the per-email `login` bucket. Without it one
  // address can rotate through unlimited emails, getting a fresh 10-attempt
  // budget for each — which is exactly how credential stuffing is run.
  loginIp: { windowMs: 15 * 60 * 1000, maxRequests: 50 },
  // Unauthenticated and not free: every attempt costs a token hash plus a
  // lookup, so it must be capped before the work is done.
  refresh: { windowMs: 15 * 60 * 1000, maxRequests: 30 },
  logout: { windowMs: 60 * 1000, maxRequests: 20 },
  ai: { windowMs: 60 * 1000, maxRequests: 20 },
  // Deliberately loose. Keyed by IP because the signed URL carries no user, so
  // a whole office behind one NAT shares this bucket, and a report page pulls
  // dozens of photos at once. Still cuts a flood by three orders of magnitude,
  // and the global budget is the real backstop.
  media: { windowMs: 60 * 1000, maxRequests: 1200 },
  position: { windowMs: 60 * 1000, maxRequests: 120 },
  scan: { windowMs: 60 * 1000, maxRequests: 30 },
  incident: { windowMs: 60 * 1000, maxRequests: 10 },
  report: { windowMs: 60 * 1000, maxRequests: 10 },
  emergency: { windowMs: 5 * 60 * 1000, maxRequests: 6 },
  export: { windowMs: 60 * 1000, maxRequests: 5 },
  write: { windowMs: 60 * 1000, maxRequests: 40 },
};

const DEFAULT_LIMIT: RateLimitConfig = { windowMs: 60 * 1000, maxRequests: 60 };

export function getRateLimit(action: string): RateLimitConfig {
  return limits[action] ?? DEFAULT_LIMIT;
}

// --- Global load-shedding configuration -----------------------------------
// Number of counter shards the per-second global budget is spread across. More
// shards = less write contention, at the cost of more reads per check.
const GLOBAL_SHARDS = 10;

// Max admitted requests per second across the WHOLE deployment (all actors,
// all instrumented routes). Override per environment with
// GLOBAL_RATE_LIMIT_PER_SECOND. Sized well above normal peak so it only trips
// under genuine overload, not steady traffic.
function globalLimitPerSecond(): number {
  const raw = Number(process.env.GLOBAL_RATE_LIMIT_PER_SECOND);
  return Number.isFinite(raw) && raw > 0 ? raw : 150;
}

const SECOND_MS = 1000;
// Keep expired counter rows around briefly so the cron sweep, not the hot
// path, does the deleting.
const COUNTER_GRACE_MS = 5 * 1000;

type GuardResult = {
  allowed: boolean;
  retryAfterMs: number;
  reason: string;
  // "" when allowed, else which control rejected it (for logging / 429 vs 503).
  scope: "" | "global" | "actor";
};

/**
 * Admit-or-reject a single request. Runs global load shedding first (a busy
 * system sheds before it bothers with per-actor bookkeeping), then the
 * per-actor limit. Counters are only incremented when the request is admitted.
 *
 * Pass `skipGlobal: true` for requests that must never be shed by the global
 * budget (e.g. emergency triggers) — they still obey their per-actor limit.
 */
export const guard = internalMutation({
  args: {
    action: v.string(),
    actorId: v.string(),
    skipGlobal: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<GuardResult> => {
    const now = Date.now();

    // --- 1. Global load shedding (check only; increment after actor check) ---
    const secondWindow = Math.floor(now / SECOND_MS) * SECOND_MS;
    const shardRows: { key: string; id: import("../_generated/dataModel").Id<"rateLimits"> | null; count: number }[] = [];
    let globalTotal = 0;
    if (!args.skipGlobal) {
      for (let i = 0; i < GLOBAL_SHARDS; i++) {
        const key = `__global__:${secondWindow}:${i}`;
        const row = await ctx.db
          .query("rateLimits")
          .withIndex("by_bucketKey", (q) => q.eq("bucketKey", key))
          .unique();
        shardRows.push({ key, id: row?._id ?? null, count: row?.count ?? 0 });
        globalTotal += row?.count ?? 0;
      }
      if (globalTotal >= globalLimitPerSecond()) {
        return {
          allowed: false,
          retryAfterMs: Math.max(secondWindow + SECOND_MS - now, 1000),
          reason: "The service is busy right now. Please retry in a moment.",
          scope: "global",
        };
      }
    }

    // --- 2. Per-actor fixed-window limit ---
    const config = getRateLimit(args.action);
    const actorWindowStart = Math.floor(now / config.windowMs) * config.windowMs;
    const actorKey = `${args.action}:${args.actorId}:${actorWindowStart}`;
    const actorRow = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucketKey", (q) => q.eq("bucketKey", actorKey))
      .unique();
    if (actorRow && actorRow.count >= config.maxRequests) {
      return {
        allowed: false,
        retryAfterMs: Math.max(actorWindowStart + config.windowMs - now, 1000),
        reason: "Too many requests. Please slow down and try again shortly.",
        scope: "actor",
      };
    }

    // --- Admitted: record consumption on both counters ---
    if (!args.skipGlobal) {
      const pick = shardRows[Math.floor(Math.random() * GLOBAL_SHARDS)];
      if (pick.id) {
        await ctx.db.patch(pick.id, { count: pick.count + 1 });
      } else {
        await ctx.db.insert("rateLimits", {
          bucketKey: pick.key,
          count: 1,
          windowStart: secondWindow,
          expiresAt: secondWindow + SECOND_MS + COUNTER_GRACE_MS,
        });
      }
    }
    if (actorRow) {
      await ctx.db.patch(actorRow._id, { count: actorRow.count + 1 });
    } else {
      await ctx.db.insert("rateLimits", {
        bucketKey: actorKey,
        count: 1,
        windowStart: actorWindowStart,
        expiresAt: actorWindowStart + config.windowMs + COUNTER_GRACE_MS,
      });
    }

    return { allowed: true, retryAfterMs: 0, reason: "", scope: "" };
  },
});

/**
 * Read-only peek at the current global load (admitted requests in the current
 * one-second window), for a health/observability endpoint. Never mutates.
 */
export const globalLoad = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const secondWindow = Math.floor(now / SECOND_MS) * SECOND_MS;
    let total = 0;
    for (let i = 0; i < GLOBAL_SHARDS; i++) {
      const row = await ctx.db
        .query("rateLimits")
        .withIndex("by_bucketKey", (q) =>
          q.eq("bucketKey", `__global__:${secondWindow}:${i}`),
        )
        .unique();
      total += row?.count ?? 0;
    }
    return { requestsThisSecond: total, limitPerSecond: globalLimitPerSecond() };
  },
});

/**
 * Cron sweep: delete counter rows whose window has fully elapsed. Keeps the
 * table small and the by_bucketKey lookups fast. Batched to stay well under
 * Convex's per-mutation write ceiling.
 */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("rateLimits")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(4000);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { deleted: stale.length };
  },
});
