import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const listDailyExportsForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return [];
    const exports = await ctx.db.query("exportFiles").order("desc").collect();
    const users = await ctx.db.query("users").collect();

    return exports
      .filter((item) => user.role === "admin" || item.clientId === user.clientId)
      .map((item) => ({
        id: item.legacyId ?? item._id,
        type: item.type,
        date: item.date,
        format: item.format,
        status: item.status,
        scopeLabel: item.scopeLabel,
        clientId: item.clientId ?? null,
        requestedBy: item.requestedBy,
        requestedByName:
          users.find((candidate) => candidate._id === item.requestedBy)?.name ?? "",
        fileName: item.fileName,
        downloadUrl: item.downloadUrl,
        generatedAt: new Date(item.generatedAt).toISOString(),
        createdAt: new Date(item.createdAt).toISOString(),
        totals: item.totals,
      }));
  },
});

export const createDailyExportRecord = internalMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    scopeLabel: v.string(),
    fileName: v.string(),
    downloadUrl: v.string(),
    storageId: v.optional(v.string()),
    totals: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const now = Date.now();
    const id = await ctx.db.insert("exportFiles", {
      type: "daily_tour",
      date: args.date,
      format: "csv",
      status: "ready",
      scopeLabel: args.scopeLabel,
      clientId: user?.clientId,
      requestedBy: args.userId,
      fileName: args.fileName,
      storageId: args.storageId,
      downloadUrl: args.downloadUrl,
      totals: args.totals,
      generatedAt: now,
      createdAt: now,
    });
    return {
      id,
      type: "daily_tour",
      date: args.date,
      format: "csv",
      status: "ready",
      scopeLabel: args.scopeLabel,
      clientId: user?.clientId ?? null,
      requestedBy: args.userId,
      requestedByName: user?.name ?? "",
      fileName: args.fileName,
      downloadUrl: args.downloadUrl,
      generatedAt: new Date(now).toISOString(),
      createdAt: new Date(now).toISOString(),
      totals: args.totals,
    };
  },
});

/**
 * Who owns the export held under this storage id.
 *
 * Used by the /files/ route as a second gate behind the signed URL, matching
 * what /photos/ already does for images. An export is a whole client's patrol
 * history in one file, so it is the last thing that should rest on a single
 * check — if any read path ever mints a download link without authorizing the
 * record first, this is what still refuses it.
 */
export const ownerByStorageId = internalQuery({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("exportFiles")
      .filter((q) => q.eq(q.field("storageId"), args.storageId))
      .first();
    if (!file) return null;
    return {
      clientId: file.clientId ?? null,
      requestedBy: file.requestedBy,
    };
  },
});
