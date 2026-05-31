import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

const limits: Record<string, RateLimitConfig> = {
  login: { windowMs: 15 * 60 * 1000, maxRequests: 5 },
  scan: { windowMs: 60 * 1000, maxRequests: 30 },
  incident: { windowMs: 60 * 1000, maxRequests: 10 },
  report: { windowMs: 60 * 1000, maxRequests: 10 },
  emergency: { windowMs: 5 * 60 * 1000, maxRequests: 3 },
  export: { windowMs: 60 * 1000, maxRequests: 5 },
};

export function getRateLimit(action: string): RateLimitConfig {
  return limits[action] ?? { windowMs: 60 * 1000, maxRequests: 60 };
}

export const checkRateLimit = internalQuery({
  args: {
    action: v.string(),
    actorId: v.string(),
    auditAction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = getRateLimit(args.action);
    const since = Date.now() - config.windowMs;
    const auditAction = args.auditAction ?? `rate_limit.${args.action}`;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_action", (q) => q.eq("action", auditAction))
      .collect();

    const recent = logs.filter((log) => {
      return log.timestamp >= since && log.actorId === args.actorId;
    }).length;

    if (recent >= config.maxRequests) {
      const entries = logs
        .filter((log) => log.timestamp >= since && log.actorId === args.actorId)
        .sort((a, b) => a.timestamp - b.timestamp);
      const oldestEntry = entries[0];
      const retryAfterMs = oldestEntry
        ? oldestEntry.timestamp + config.windowMs - Date.now()
        : config.windowMs;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    return { allowed: true, retryAfterMs: 0 };
  },
});
