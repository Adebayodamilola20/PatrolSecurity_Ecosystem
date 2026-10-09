import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getOrphanUploadTtlMs } from "./env";

export const photoKind = v.union(
  v.literal("clock_in"),
  v.literal("clock_out"),
  v.literal("incident"),
  v.literal("maintenance"),
  v.literal("post_order_proof"),
  v.literal("handover"),
);

export const assetByStorageId = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("photoAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
  },
});

/**
 * Records a validated upload. Called once the bytes have landed in storage and
 * passed inspection, before any record points at them.
 */
export const claimAsset = internalMutation({
  args: {
    storageId: v.id("_storage"),
    uploadedBy: v.id("users"),
    kind: photoKind,
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("photoAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    // Re-claiming your own not-yet-attached upload is a retry, not an error.
    if (existing) {
      if (existing.uploadedBy !== args.uploadedBy) {
        throw new Error("Upload already claimed by another user");
      }
      return existing._id;
    }

    const uploader = await ctx.db.get(args.uploadedBy);
    const assignment = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.uploadedBy))
      .first();

    // Most guards carry no clientId of their own — they belong to a tenant only
    // through the site they are assigned to. Falling back to the site's owner is
    // what makes the tenant re-check on /photos actually bite; without it the
    // asset would have no owner and every viewer would pass.
    const site = assignment?.siteId ? await ctx.db.get(assignment.siteId) : null;
    const clientId = uploader?.clientId ?? site?.clientId;

    return await ctx.db.insert("photoAssets", {
      storageId: args.storageId,
      clientId,
      siteId: assignment?.siteId,
      uploadedBy: args.uploadedBy,
      kind: args.kind,
      contentType: args.contentType,
      sizeBytes: args.sizeBytes,
      attachedAt: undefined,
      createdAt: Date.now(),
    });
  },
});

/**
 * Binds a claimed upload to the record that now references it, which also takes
 * it out of reach of the orphan sweeper.
 *
 * Rejects an upload claimed by somebody else (so a leaked storageId cannot be
 * stapled onto an attacker's record) and one already attached elsewhere.
 */
export const attachAsset = internalMutation({
  args: {
    storageId: v.id("_storage"),
    userId: v.id("users"),
    table: v.string(),
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db
      .query("photoAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!asset) throw new Error("Photo was not claimed before use");
    if (asset.uploadedBy !== args.userId) {
      throw new Error("Photo belongs to another user");
    }
    if (asset.attachedAt && asset.attachedId !== args.recordId) {
      throw new Error("Photo is already attached to another record");
    }
    await ctx.db.patch(asset._id, {
      attachedAt: Date.now(),
      attachedTable: args.table,
      attachedId: args.recordId,
    });
    return asset._id;
  },
});

const SWEEP_BATCH_SIZE = 256;

/**
 * Deletes uploads that were claimed but never attached to a record — the phone
 * died between taking the photo and submitting the form.
 *
 * Scoped deliberately to photoAssets rows rather than walking storage itself:
 * report PDFs live in the same storage and have no asset row, so enumerating
 * storage would delete them.
 */
export const sweepOrphanedUploads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - getOrphanUploadTtlMs();
    const orphans = await ctx.db
      .query("photoAssets")
      .withIndex("by_attachedAt", (q) => q.eq("attachedAt", undefined))
      .take(SWEEP_BATCH_SIZE);

    let deleted = 0;
    for (const asset of orphans) {
      if (asset.createdAt >= cutoff) continue;
      await ctx.storage.delete(asset.storageId);
      await ctx.db.delete(asset._id);
      deleted += 1;
    }

    if (orphans.length === SWEEP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.photos.sweepOrphanedUploads, {});
    }
    return { scanned: orphans.length, deleted };
  },
});
