import { internalMutation, internalQuery } from "./_generated/server";
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
