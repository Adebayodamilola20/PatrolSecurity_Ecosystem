import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const backfillTenantFields = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const stats: Record<string, number> = {};
    const count = (table: string) => {
      stats[table] = (stats[table] ?? 0) + 1;
    };

    const users = await ctx.db.query("users").collect();
    const userById = new Map(users.map((user) => [user._id, user]));
    const sites = await ctx.db.query("sites").collect();
    const siteById = new Map(sites.map((site) => [site._id, site]));
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const checkpointById = new Map(
      checkpoints.map((checkpoint) => [checkpoint._id, checkpoint]),
    );

    for (const assignment of await ctx.db
      .query("userSiteAssignments")
      .collect()) {
      if (assignment.clientId) continue;
      const site = siteById.get(assignment.siteId);
      if (!site) continue;
      count("userSiteAssignments");
      if (!dryRun)
        await ctx.db.patch(assignment._id, { clientId: site.clientId });
    }

    for (const shift of await ctx.db.query("shifts").collect()) {
      if (shift.clientId && shift.siteId) continue;
      const user = userById.get(shift.userId);
      const assignment =
        (await ctx.db
          .query("userSiteAssignments")
          .withIndex("by_userId", (q) => q.eq("userId", shift.userId))
          .first()) ?? undefined;
      const patch = {
        clientId: shift.clientId ?? user?.clientId,
        siteId: shift.siteId ?? assignment?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("shifts");
      if (!dryRun) await ctx.db.patch(shift._id, patch);
    }

    for (const scan of await ctx.db.query("scans").collect()) {
      if (scan.clientId && scan.siteId) continue;
      const checkpoint = checkpointById.get(scan.checkpointId);
      const officer = userById.get(scan.officerId);
      const patch = {
        clientId: scan.clientId ?? checkpoint?.clientId ?? officer?.clientId,
        siteId: scan.siteId ?? checkpoint?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("scans");
      if (!dryRun) await ctx.db.patch(scan._id, patch);
    }

    for (const position of await ctx.db.query("officerPositions").collect()) {
      if (position.clientId && position.siteId) continue;
      const user = userById.get(position.userId);
      const assignment = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId", (q) => q.eq("userId", position.userId))
        .first();
      const patch = {
        clientId: position.clientId ?? user?.clientId,
        siteId: position.siteId ?? assignment?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("officerPositions");
      if (!dryRun) await ctx.db.patch(position._id, patch);
    }

    for (const incident of await ctx.db.query("incidents").collect()) {
      if (incident.clientId && incident.siteId) continue;
      const checkpoint = incident.checkpointId
        ? checkpointById.get(incident.checkpointId)
        : undefined;
      const officer = userById.get(incident.officerId);
      const patch = {
        clientId:
          incident.clientId ?? checkpoint?.clientId ?? officer?.clientId,
        siteId: incident.siteId ?? checkpoint?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("incidents");
      if (!dryRun) await ctx.db.patch(incident._id, patch);
    }

    for (const submission of await ctx.db
      .query("reportSubmissions")
      .collect()) {
      if (submission.clientId && submission.siteId) continue;
      const checkpoint = submission.checkpointId
        ? checkpointById.get(submission.checkpointId)
        : undefined;
      const user = userById.get(submission.userId);
      const patch = {
        clientId: submission.clientId ?? checkpoint?.clientId ?? user?.clientId,
        siteId: submission.siteId ?? checkpoint?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("reportSubmissions");
      if (!dryRun) await ctx.db.patch(submission._id, patch);
    }

    for (const event of await ctx.db.query("emergencyEvents").collect()) {
      if (event.clientId && event.siteId) continue;
      const checkpoint = event.checkpointId
        ? checkpointById.get(event.checkpointId)
        : undefined;
      const user = userById.get(event.userId);
      const patch = {
        clientId: event.clientId ?? checkpoint?.clientId ?? user?.clientId,
        siteId: event.siteId ?? checkpoint?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("emergencyEvents");
      if (!dryRun) await ctx.db.patch(event._id, patch);
    }

    const passOnLogs = await ctx.db.query("passOnLogs").collect();
    const passOnLogById = new Map(passOnLogs.map((log) => [log._id, log]));
    for (const log of passOnLogs) {
      if (log.clientId && log.siteId) continue;
      const checkpoint = log.checkpointId
        ? checkpointById.get(log.checkpointId)
        : undefined;
      const creator = userById.get(log.createdBy);
      const patch = {
        clientId: log.clientId ?? checkpoint?.clientId ?? creator?.clientId,
        siteId: log.siteId ?? checkpoint?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("passOnLogs");
      if (!dryRun) await ctx.db.patch(log._id, patch);
    }

    for (const ack of await ctx.db
      .query("passOnLogAcknowledgements")
      .collect()) {
      if (ack.clientId && ack.siteId) continue;
      const log = passOnLogById.get(ack.passOnLogId);
      const patch = {
        clientId: ack.clientId ?? log?.clientId,
        siteId: ack.siteId ?? log?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("passOnLogAcknowledgements");
      if (!dryRun) await ctx.db.patch(ack._id, patch);
    }

    const postOrders = await ctx.db.query("postOrders").collect();
    const postOrderById = new Map(
      postOrders.map((order) => [order._id, order]),
    );
    for (const order of postOrders) {
      if (order.clientId && order.siteId) continue;
      const checkpoint = order.checkpointId
        ? checkpointById.get(order.checkpointId)
        : undefined;
      const creator = userById.get(order.createdBy);
      const patch = {
        clientId: order.clientId ?? checkpoint?.clientId ?? creator?.clientId,
        siteId: order.siteId ?? checkpoint?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("postOrders");
      if (!dryRun) await ctx.db.patch(order._id, patch);
    }

    for (const completion of await ctx.db
      .query("postOrderCompletions")
      .collect()) {
      if (completion.clientId && completion.siteId) continue;
      const order = postOrderById.get(completion.postOrderId);
      const checkpoint = completion.checkpointId
        ? checkpointById.get(completion.checkpointId)
        : undefined;
      const patch = {
        clientId:
          completion.clientId ?? order?.clientId ?? checkpoint?.clientId,
        siteId: completion.siteId ?? order?.siteId ?? checkpoint?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("postOrderCompletions");
      if (!dryRun) await ctx.db.patch(completion._id, patch);
    }

    for (const handover of await ctx.db.query("handovers").collect()) {
      if (handover.clientId && handover.siteId) continue;
      const checkpoint = handover.checkpointId
        ? checkpointById.get(handover.checkpointId)
        : undefined;
      const fromUser = userById.get(handover.fromUserId);
      const shift = handover.shiftId
        ? await ctx.db.get(handover.shiftId)
        : null;
      const patch = {
        clientId:
          handover.clientId ??
          checkpoint?.clientId ??
          shift?.clientId ??
          fromUser?.clientId,
        siteId: handover.siteId ?? checkpoint?.siteId ?? shift?.siteId,
      };
      if (!patch.clientId && !patch.siteId) continue;
      count("handovers");
      if (!dryRun) await ctx.db.patch(handover._id, patch);
    }

    return { dryRun, stats };
  },
});
