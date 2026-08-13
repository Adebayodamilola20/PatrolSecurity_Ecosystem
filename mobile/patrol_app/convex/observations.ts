import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Guard observations: a message and a place.
 *
 * The incident report exists for things that need a category, a severity and a
 * resolution. Most of what a guard actually needs to pass on is none of those
 * — a light is out, the client asked for an extra sweep, the vehicle is making
 * a noise. Asked to file an incident for that, a guard files nothing, and the
 * information dies on the shift.
 */
export const create = internalMutation({
  args: {
    officerId: v.id("users"),
    message: v.string(),
    siteId: v.optional(v.id("sites")),
    checkpointId: v.optional(v.id("checkpoints")),
  },
  handler: async (ctx, args) => {
    const message = args.message.trim();
    if (!message) throw new Error("An observation needs a message");

    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;
    const siteId = checkpoint?.siteId ?? args.siteId;
    const site = siteId ? await ctx.db.get(siteId) : null;

    // A guard may only file against a place they are posted to. Otherwise the
    // note lands in another company's control room, tagged with their site.
    if (siteId) {
      const posted = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId_siteId", (q) =>
          q.eq("userId", args.officerId).eq("siteId", siteId),
        )
        .first();
      if (!posted) throw new Error("You are not posted to that location");
    }

    const id = await ctx.db.insert("observations", {
      clientId: checkpoint?.clientId ?? site?.clientId,
      siteId,
      checkpointId: args.checkpointId,
      officerId: args.officerId,
      message,
      siteLabel: site?.name ?? "",
      createdAt: Date.now(),
    });
    return { id, message, siteId: siteId ?? null, createdAt: new Date().toISOString() };
  },
});

/**
 * The control room's list.
 *
 * Staff see everything; a client account sees only its own sites; a guard sees
 * only what they wrote themselves. Scoping happens here rather than in the
 * route so a second caller cannot skip it.
 */
export const list = internalQuery({
  args: {
    viewerId: v.id("users"),
    limit: v.optional(v.number()),
    includeAcknowledged: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db.get(args.viewerId);
    if (!viewer) return [];

    const rows = await ctx.db
      .query("observations")
      .withIndex("by_createdAt")
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 100, 1), 300));

    const visible = rows.filter((row) => {
      if (!args.includeAcknowledged && row.acknowledgedAt) return false;
      if (viewer.role === "admin" || viewer.role === "supervisor") return true;
      if (viewer.role === "main_account") {
        return !!viewer.clientId && row.clientId === viewer.clientId;
      }
      return row.officerId === args.viewerId;
    });

    const users = await ctx.db.query("users").collect();
    const sites = await ctx.db.query("sites").collect();
    const clients = await ctx.db.query("clients").collect();
    const checkpoints = await ctx.db.query("checkpoints").collect();

    return visible.map((row) => ({
      id: row._id,
      message: row.message,
      officerId: row.officerId,
      // Client accounts read this list too, and the standing rule is that a
      // client never learns which guard did what.
      officerName:
        viewer.role === "main_account"
          ? null
          : (users.find((u) => u._id === row.officerId)?.name ?? ""),
      siteId: row.siteId ?? null,
      siteName: sites.find((s) => s._id === row.siteId)?.name ?? row.siteLabel,
      checkpointId: row.checkpointId ?? null,
      checkpointName:
        checkpoints.find((c) => c._id === row.checkpointId)?.name ?? null,
      clientId: row.clientId ?? null,
      clientName: clients.find((c) => c._id === row.clientId)?.name ?? null,
      acknowledgedAt: row.acknowledgedAt
        ? new Date(row.acknowledgedAt).toISOString()
        : null,
      acknowledgedByName: row.acknowledgedByUserId
        ? (users.find((u) => u._id === row.acknowledgedByUserId)?.name ?? "")
        : null,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  },
});

export const acknowledge = internalMutation({
  args: {
    observationId: v.id("observations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.observationId);
    if (!row) throw new Error("Observation not found");
    if (row.acknowledgedAt) return { alreadyAcknowledged: true };
    await ctx.db.patch(args.observationId, {
      acknowledgedAt: Date.now(),
      acknowledgedByUserId: args.userId,
    });
    return { alreadyAcknowledged: false };
  },
});
