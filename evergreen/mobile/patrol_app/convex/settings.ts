import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("communicationSettings").order("desc").collect();
    return settings.map((item) => ({
      id: item.legacyId ?? item._id,
      scopeType: item.scopeType,
      scopeId: item.scopeId,
      settingKey: item.settingKey,
      settingValue: item.settingValue,
      updatedBy: item.updatedBy ?? null,
      createdAt: new Date(item.createdAt).toISOString(),
    }));
  },
});

export const getLatest = internalQuery({
  args: {
    settingKey: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("communicationSettings")
      .withIndex("by_settingKey", (q) => q.eq("settingKey", args.settingKey))
      .collect();
    const latest = rows.sort((a, b) => b.createdAt - a.createdAt)[0];
    return latest?.settingValue ?? null;
  },
});

export const create = internalMutation({
  args: {
    settingKey: v.string(),
    settingValue: v.string(),
    scopeType: v.optional(v.string()),
    scopeId: v.optional(v.string()),
    updatedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("communicationSettings", {
      settingKey: args.settingKey,
      settingValue: args.settingValue,
      scopeType: args.scopeType ?? "global",
      scopeId: args.scopeId ?? "",
      updatedBy: args.updatedBy,
      createdAt: now,
    });
    return {
      id,
      settingKey: args.settingKey,
      settingValue: args.settingValue,
      scopeType: args.scopeType ?? "global",
      scopeId: args.scopeId ?? "",
      updatedBy: args.updatedBy ?? null,
      createdAt: new Date(now).toISOString(),
    };
  },
});

/**
 * Whether guards must scan the location's main-entrance QR to clock in.
 *
 * Kept in communicationSettings rather than a table of its own: that table is
 * already this system's append-only key/value store with `updatedBy` on every
 * row, so each change is history rather than an overwrite. The dashboard's
 * settings page only reads the keys it knows, so an extra key is invisible to
 * it.
 */
export const REQUIRE_QR_CHECK_IN_KEY = "check_in.require_qr";

/**
 * The current value of the QR check-in switch. Off until an admin turns it on:
 * enforcing it by default would lock every guard out on the morning it ships,
 * before a single entrance QR had been printed.
 *
 * Latest row wins. The index orders rows of one key by creation time, so the
 * newest write is the first one read in descending order — no reliance on a
 * client-chosen timestamp, and no tie when two writes share a millisecond.
 */
export async function readRequireQrCheckIn(
  ctx: QueryCtx | MutationCtx,
): Promise<boolean> {
  const latest = await ctx.db
    .query("communicationSettings")
    .withIndex("by_settingKey", (q) => q.eq("settingKey", REQUIRE_QR_CHECK_IN_KEY))
    .order("desc")
    .first();
  return latest?.settingValue === "true";
}

export const getCheckIn = internalQuery({
  args: {},
  handler: async (ctx) => ({ requireQrCheckIn: await readRequireQrCheckIn(ctx) }),
});

export const setCheckIn = internalMutation({
  args: {
    requireQrCheckIn: v.boolean(),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("communicationSettings", {
      settingKey: REQUIRE_QR_CHECK_IN_KEY,
      settingValue: args.requireQrCheckIn ? "true" : "false",
      scopeType: "global",
      scopeId: "",
      updatedBy: args.updatedBy,
      createdAt: Date.now(),
    });
    return { requireQrCheckIn: await readRequireQrCheckIn(ctx) };
  },
});
