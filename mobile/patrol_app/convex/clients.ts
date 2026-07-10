import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const list = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let clients = await ctx.db.query("clients").collect();
    if (args.clientId) clients = clients.filter(c => c._id === args.clientId);
    return clients.map(c => ({
      id: c.legacyId ?? c._id, convexId: c._id, name: c.name,
      email: c.email, phone: c.phone, active: c.active,
      createdAt: new Date(c.createdAt).toISOString(),
    }));
  },
});

export const getById = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.clientId);
    if (!c) return null;
    return {
      id: c.legacyId ?? c._id,
      convexId: c._id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      active: c.active,
      createdAt: new Date(c.createdAt).toISOString(),
    };
  },
});

export const create = internalMutation({
  args: { name: v.string(), email: v.string(), phone: v.string(), active: v.boolean() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("clients", { ...args, createdAt: Date.now() });
    return { id, ...args, convexId: id, createdAt: new Date().toISOString() };
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("clients")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) return byLegacyId._id;
    const all = await ctx.db.query("clients").collect();
    return all.find((c) => c._id === args.id)?._id ?? null;
  },
});

// Creates the client company AND its portal login (main_account user) in one
// transaction, so a client account can never exist half-provisioned. The
// password is hashed by the HTTP layer (bcrypt is not available in mutations).
export const createWithLogin = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    passwordHash: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error("A user with this email already exists");

    const createdAt = Date.now();
    const clientId = await ctx.db.insert("clients", {
      name: args.name,
      email,
      phone: args.phone,
      active: args.active,
      createdAt,
    });
    const userId = await ctx.db.insert("users", {
      name: args.name,
      email,
      passwordHash: args.passwordHash,
      role: "main_account",
      phone: args.phone,
      active: args.active,
      clientId,
      liveTracking: false,
      createdAt,
    });
    return {
      id: clientId,
      convexId: clientId,
      portalUserId: userId,
      name: args.name,
      email,
      phone: args.phone,
      active: args.active,
      createdAt: new Date(createdAt).toISOString(),
    };
  },
});

export const update = internalMutation({
  args: {
    clientId: v.id("clients"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { clientId, ...patch } = args;
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    await ctx.db.patch(clientId, cleanPatch as any);
    // Keep the portal login in step when company identity fields change.
    if (cleanPatch.name || cleanPatch.email || cleanPatch.active !== undefined) {
      const portalUsers = await ctx.db
        .query("users")
        .withIndex("by_role_clientId", (q) =>
          q.eq("role", "main_account").eq("clientId", clientId),
        )
        .collect();
      for (const u of portalUsers) {
        await ctx.db.patch(u._id, {
          ...(cleanPatch.name ? { name: cleanPatch.name as string } : {}),
          ...(cleanPatch.email
            ? { email: (cleanPatch.email as string).trim().toLowerCase() }
            : {}),
          ...(cleanPatch.active !== undefined
            ? { active: cleanPatch.active as boolean }
            : {}),
        });
      }
    }
    const updated = await ctx.db.get(clientId);
    return updated
      ? {
          id: updated.legacyId ?? updated._id,
          convexId: updated._id,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          active: updated.active,
          createdAt: new Date(updated.createdAt).toISOString(),
        }
      : null;
  },
});

// Full drill-down for the admin "client account" page: company info, portal
// login, and the Location -> Sub-location tree with scan activity.
export const getDetail = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return null;

    const portalUsers = await ctx.db
      .query("users")
      .withIndex("by_role_clientId", (q) =>
        q.eq("role", "main_account").eq("clientId", args.clientId),
      )
      .collect();

    const sites = await ctx.db
      .query("sites")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .collect();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const siteDetails = await Promise.all(
      sites.map(async (site) => {
        const checkpoints = await ctx.db
          .query("checkpoints")
          .withIndex("by_siteId", (q) => q.eq("siteId", site._id))
          .collect();

        const scansToday = await ctx.db
          .query("scans")
          .withIndex("by_siteId_scannedAt", (q) =>
            q.eq("siteId", site._id).gte("scannedAt", todayMs),
          )
          .collect();

        const subLocations = await Promise.all(
          checkpoints.map(async (cp) => {
            const lastScan = await ctx.db
              .query("scans")
              .withIndex("by_checkpointId_scannedAt", (q) =>
                q.eq("checkpointId", cp._id),
              )
              .order("desc")
              .first();
            const cpScansToday = scansToday.filter(
              (s) => s.checkpointId === cp._id,
            );
            return {
              id: cp._id,
              name: cp.name,
              code: cp.code,
              hasOwnGps: cp.latitude != null && cp.longitude != null,
              active: cp.active,
              scansToday: cpScansToday.length,
              verifiedToday: cpScansToday.filter((s) => s.gpsValid).length,
              lastScanAt: lastScan
                ? new Date(lastScan.scannedAt).toISOString()
                : null,
              lastScanVerified: lastScan ? lastScan.gpsValid : null,
              createdAt: new Date(cp.createdAt).toISOString(),
            };
          }),
        );

        return {
          id: site._id,
          name: site.name,
          location: site.location,
          address: site.address ?? null,
          latitude: site.latitude ?? null,
          longitude: site.longitude ?? null,
          radiusMeters: site.radiusMeters ?? null,
          active: site.active,
          scansToday: scansToday.length,
          verifiedToday: scansToday.filter((s) => s.gpsValid).length,
          subLocations,
          createdAt: new Date(site.createdAt).toISOString(),
        };
      }),
    );

    return {
      id: client._id,
      convexId: client._id,
      name: client.name,
      email: client.email,
      phone: client.phone,
      active: client.active,
      createdAt: new Date(client.createdAt).toISOString(),
      portalLogins: portalUsers.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        active: u.active,
        createdAt: new Date(u.createdAt).toISOString(),
      })),
      sites: siteDetails,
    };
  },
});
