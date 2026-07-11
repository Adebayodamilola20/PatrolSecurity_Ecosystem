import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Refresh tokens live 30 days from issue; each use rotates to a fresh token
// (sliding expiry), so an active user is never logged out while an abandoned
// session dies within 30 days. Access tokens themselves last 30 minutes.
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const issue = internalMutation({
  args: {
    userId: v.id("users"),
    tokenHash: v.string(),
    familyId: v.string(),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("refreshTokens", {
      ...args,
      createdAt: now,
      expiresAt: now + REFRESH_TTL_MS,
    });
  },
});

// Single-use rotation: the presented token is revoked and replaced. A token
// that is presented AFTER it was rotated/revoked is treated as stolen — the
// whole family is revoked so neither the attacker nor the victim keeps a
// working session (the legitimate user simply signs in again).
export const rotate = internalMutation({
  args: {
    tokenHash: v.string(),
    newTokenHash: v.string(),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("refreshTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!existing) return { status: "invalid" as const, userId: null };

    const now = Date.now();
    if (existing.revokedAt) {
      const family = await ctx.db
        .query("refreshTokens")
        .withIndex("by_familyId", (q) => q.eq("familyId", existing.familyId))
        .collect();
      for (const t of family) {
        if (!t.revokedAt) await ctx.db.patch(t._id, { revokedAt: now });
      }
      return { status: "reused" as const, userId: existing.userId };
    }
    if (existing.expiresAt <= now) {
      await ctx.db.patch(existing._id, { revokedAt: now });
      return { status: "expired" as const, userId: null };
    }
    const user = await ctx.db.get(existing.userId);
    if (!user || !user.active) {
      await ctx.db.patch(existing._id, { revokedAt: now });
      return { status: "invalid" as const, userId: null };
    }

    const replacedBy = await ctx.db.insert("refreshTokens", {
      userId: existing.userId,
      tokenHash: args.newTokenHash,
      familyId: existing.familyId,
      createdAt: now,
      expiresAt: now + REFRESH_TTL_MS,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    await ctx.db.patch(existing._id, {
      revokedAt: now,
      lastUsedAt: now,
      replacedBy,
    });
    return { status: "ok" as const, userId: existing.userId };
  },
});

// Logout: revoke the presented token's whole family. Returns the userId (for
// the audit trail) or null when the token was unknown — logout never fails.
export const revokeFamilyByHash = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("refreshTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!existing) return null;
    const now = Date.now();
    const family = await ctx.db
      .query("refreshTokens")
      .withIndex("by_familyId", (q) => q.eq("familyId", existing.familyId))
      .collect();
    for (const t of family) {
      if (!t.revokedAt) await ctx.db.patch(t._id, { revokedAt: now });
    }
    return existing.userId;
  },
});

// Kills every session a user has, across all devices. Used on password
// change; also the lever for a future admin "sign this user out" control.
export const revokeAllForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("refreshTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const now = Date.now();
    for (const t of tokens) {
      if (!t.revokedAt) await ctx.db.patch(t._id, { revokedAt: now });
    }
  },
});

// Cron: purge tokens whose absolute expiry has passed. Revoked-but-unexpired
// rows are kept on purpose — they are what makes reuse detection work.
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("refreshTokens")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(500);
    for (const t of expired) {
      await ctx.db.delete(t._id);
    }
    return { deleted: expired.length };
  },
});
