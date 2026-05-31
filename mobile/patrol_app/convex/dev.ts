import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const hasUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").first();
    return !!users;
  },
});

export const seedDefaults = mutation({
  args: {
    adminPasswordHash: v.string(),
    clientPasswordHash: v.string(),
    guardPasswordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db.query("users").first();
    if (existingUser) {
      return { seeded: false, reason: "users already exist" };
    }

    const now = Date.now();
    const clientId = await ctx.db.insert("clients", {
      legacyId: crypto.randomUUID(),
      name: "SecureCorp Nigeria",
      email: "client@securecorp.com",
      phone: "+234 800 000 0001",
      active: true,
      createdAt: now,
    });
    const site1Id = await ctx.db.insert("sites", {
      legacyId: crypto.randomUUID(),
      clientId,
      name: "Lagos HQ",
      location: "Lagos, Nigeria",
      active: true,
      createdAt: now,
    });
    await ctx.db.insert("sites", {
      legacyId: crypto.randomUUID(),
      clientId,
      name: "Abuja Branch",
      location: "Abuja, Nigeria",
      active: true,
      createdAt: now,
    });

    await ctx.db.insert("users", {
      legacyId: crypto.randomUUID(),
      name: "Company Admin",
      email: "admin@securecorp.com",
      passwordHash: args.adminPasswordHash,
      role: "admin",
      phone: "+234 800 000 0000",
      active: true,
      liveTracking: true,
      createdAt: now,
    });
    await ctx.db.insert("users", {
      legacyId: crypto.randomUUID(),
      name: "Client Admin",
      email: "client@securecorp.com",
      passwordHash: args.clientPasswordHash,
      role: "main_account",
      phone: "+234 800 000 0001",
      active: true,
      clientId,
      liveTracking: true,
      createdAt: now,
    });
    const guardId = await ctx.db.insert("users", {
      legacyId: crypto.randomUUID(),
      name: "Field Guard",
      email: "guard@securecorp.com",
      passwordHash: args.guardPasswordHash,
      role: "guard",
      phone: "+234 800 000 0002",
      active: true,
      clientId,
      liveTracking: true,
      createdAt: now,
    });
    await ctx.db.insert("userSiteAssignments", {
      legacyId: crypto.randomUUID(),
      clientId,
      userId: guardId,
      siteId: site1Id,
      createdAt: now,
    });
    await ctx.db.insert("checkpoints", {
      legacyId: crypto.randomUUID(),
      clientId,
      siteId: site1Id,
      name: "Shoprite Mall",
      code: "SHOPRITE-001",
      latitude: 6.5244,
      longitude: 3.3792,
      radiusMeters: 10,
      expectedIntervalMinutes: 30,
      scheduledTimeIn: "",
      scheduledTimeOut: "",
      active: true,
      createdAt: now,
    });
    const checkpointId = await ctx.db
      .query("checkpoints")
      .withIndex("by_code", (q) => q.eq("code", "SHOPRITE-001"))
      .unique();
    if (checkpointId) {
      await ctx.db.insert("postOrders", {
        legacyId: crypto.randomUUID(),
        title: "Perimeter Lock Check",
        summary: "Verify all gate locks before shift close.",
        instructions: "Inspect the perimeter gates and confirm each lock is secured.",
        checkpointId: checkpointId._id,
        assignedUserId: guardId,
        assignedRole: "guard",
        priority: "normal",
        active: true,
        requiresAcknowledgement: true,
        requiresPhotoProof: true,
        createdBy: guardId,
        createdAt: now,
      });
      await ctx.db.insert("passOnLogs", {
        legacyId: crypto.randomUUID(),
        title: "Generator Watch",
        instruction: "Monitor the backup generator noise level during rounds.",
        priority: "normal",
        siteLabel: "Lagos HQ",
        checkpointId: checkpointId._id,
        requiresAcknowledgement: true,
        createdBy: guardId,
        active: true,
        createdAt: now,
      });
    }
    return { seeded: true }
  },
})

// SECURITY: wipeAll mutation has been removed from production deployment
// DO NOT expose destructive operations

export const deleteUserByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", args.email)).unique();
    if (!user) return { deleted: false, reason: "not found" };
    const assignments = await ctx.db.query("userSiteAssignments").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect();
    for (const a of assignments) await ctx.db.delete(a._id);
    await ctx.db.delete(user._id);
    return { deleted: true };
  },
});

export const assignUserToSite = mutation({
  args: { userId: v.id("users"), siteId: v.id("sites") },
  handler: async (ctx, args) => {
    await ctx.db.insert("userSiteAssignments", {
      legacyId: crypto.randomUUID(), userId: args.userId, siteId: args.siteId, createdAt: Date.now(),
    });
    return { assigned: true };
  },
});

export const ensureDemoContent = mutation({
  args: {},
  handler: async (ctx) => {
    const guard = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", "guard@securecorp.com"))
      .unique();
    const checkpoint = await ctx.db
      .query("checkpoints")
      .withIndex("by_code", (q) => q.eq("code", "SHOPRITE-001"))
      .unique();
    if (!guard || !checkpoint) {
      return { created: false, reason: "demo users/checkpoint missing" };
    }

    const existingOrder = (
      await ctx.db.query("postOrders").collect()
    ).find((order) => order.title === "Perimeter Lock Check");
    if (!existingOrder) {
      await ctx.db.insert("postOrders", {
        legacyId: crypto.randomUUID(),
        title: "Perimeter Lock Check",
        summary: "Verify all gate locks before shift close.",
        instructions: "Inspect the perimeter gates and confirm each lock is secured.",
        checkpointId: checkpoint._id,
        assignedUserId: guard._id,
        assignedRole: "guard",
        priority: "normal",
        active: true,
        requiresAcknowledgement: true,
        requiresPhotoProof: true,
        createdBy: guard._id,
        createdAt: Date.now(),
      });
    }

    const existingLog = (
      await ctx.db.query("passOnLogs").collect()
    ).find((log) => log.title === "Generator Watch");
    if (!existingLog) {
      await ctx.db.insert("passOnLogs", {
        legacyId: crypto.randomUUID(),
        title: "Generator Watch",
        instruction: "Monitor the backup generator noise level during rounds.",
        priority: "normal",
        siteLabel: "Lagos HQ",
        checkpointId: checkpoint._id,
        requiresAcknowledgement: true,
        createdBy: guard._id,
        active: true,
        createdAt: Date.now(),
      });
    }

    return { created: true };
  },
});
