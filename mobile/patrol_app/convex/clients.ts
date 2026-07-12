import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { scrubOfficerName } from "./lib/anonymize";

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

        const describeQrPoint = async (cp: (typeof checkpoints)[number]) => {
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
        };

        // The location's own QR point is kept apart from its sub-locations.
        const primary = checkpoints.find((cp) => cp.isPrimary) ?? null;
        const locationQr = primary ? await describeQrPoint(primary) : null;
        const subLocations = await Promise.all(
          checkpoints.filter((cp) => !cp.isPrimary).map(describeQrPoint),
        );

        // Guards posted at this location. Staff-facing only — the portal
        // queries below deliberately never expose these identities.
        const assignments = await ctx.db
          .query("userSiteAssignments")
          .withIndex("by_siteId", (q) => q.eq("siteId", site._id))
          .collect();
        const assignedGuards = (
          await Promise.all(
            assignments.map(async (assignment) => {
              const guard = await ctx.db.get(assignment.userId);
              if (!guard || guard.role !== "guard") return null;
              const activeShift = await ctx.db
                .query("shifts")
                .withIndex("by_userId_status", (q) =>
                  q.eq("userId", assignment.userId).eq("status", "active"),
                )
                .first();
              return {
                id: guard._id,
                name: guard.name,
                phone: guard.phone,
                active: guard.active,
                onDuty: !!activeShift,
              };
            }),
          )
        ).filter((g): g is NonNullable<typeof g> => g !== null);

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
          assignedGuards,
          locationQr,
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

// ---- Client-portal queries (tenant-scoped, guard identities withheld) ----
// The AGM rule: clients see statistics and activity, never who the guard is.

export const portalOverview = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const sites = await ctx.db
      .query("sites")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .collect();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const guardIds = new Set<string>();
    let scansToday = 0;
    let lastScanAt: number | null = null;

    for (const site of sites) {
      const assignments = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_siteId", (q) => q.eq("siteId", site._id))
        .collect();
      for (const assignment of assignments) guardIds.add(assignment.userId);

      const siteScans = await ctx.db
        .query("scans")
        .withIndex("by_siteId_scannedAt", (q) =>
          q.eq("siteId", site._id).gte("scannedAt", todayMs),
        )
        .collect();
      scansToday += siteScans.length;

      const latest = await ctx.db
        .query("scans")
        .withIndex("by_siteId_scannedAt", (q) => q.eq("siteId", site._id))
        .order("desc")
        .first();
      if (latest && (lastScanAt === null || latest.scannedAt > lastScanAt)) {
        lastScanAt = latest.scannedAt;
      }
    }

    let totalGuards = 0;
    let guardsOnDuty = 0;
    for (const guardId of guardIds) {
      const guard = await ctx.db.get(guardId as any);
      if (!guard || (guard as any).role !== "guard" || !(guard as any).active) continue;
      totalGuards += 1;
      const activeShift = await ctx.db
        .query("shifts")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", guardId as any).eq("status", "active"),
        )
        .first();
      if (activeShift) guardsOnDuty += 1;
    }

    return {
      guardsOnDuty,
      totalGuards,
      sites: sites.map((s) => ({ id: s._id, name: s.name, location: s.address ?? s.location })),
      scansToday,
      lastScanAt,
      coveragePct: null,
    };
  },
});

export const portalScans = internalQuery({
  args: {
    clientId: v.id("clients"),
    // Per-point patrol history: only scans at this QR point. Tenant-checked
    // against the checkpoint's own clientId — a foreign id returns nothing.
    checkpointId: v.optional(v.id("checkpoints")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    if (args.checkpointId) {
      const checkpoint = await ctx.db.get(args.checkpointId);
      if (!checkpoint || checkpoint.clientId !== args.clientId) return [];
      const site = checkpoint.siteId ? await ctx.db.get(checkpoint.siteId) : null;
      const scans = await ctx.db
        .query("scans")
        .withIndex("by_checkpointId_scannedAt", (q) =>
          q.eq("checkpointId", args.checkpointId!),
        )
        .order("desc")
        .take(limit);
      return scans.map((s) => ({
        id: s._id,
        guardName: "On-duty guard",
        checkpointName: checkpoint.name,
        siteLabel: site?.name ?? "",
        scannedAt: s.scannedAt,
        gpsValid: s.gpsValid,
      }));
    }

    const sites = await ctx.db
      .query("sites")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .collect();
    const siteNames = new Map(sites.map((s) => [s._id, s.name]));
    const checkpoints = await ctx.db.query("checkpoints").collect();

    const all: Array<{
      id: string
      guardName: string
      checkpointName: string
      siteLabel: string
      scannedAt: number
      gpsValid: boolean
    }> = [];
    for (const site of sites) {
      const siteScans = await ctx.db
        .query("scans")
        .withIndex("by_siteId_scannedAt", (q) => q.eq("siteId", site._id))
        .order("desc")
        .take(50);
      for (const s of siteScans) {
        all.push({
          id: s._id,
          // Deliberately anonymized: clients never see guard identities.
          guardName: "On-duty guard",
          checkpointName:
            checkpoints.find((c) => c._id === s.checkpointId)?.name ?? "",
          siteLabel: siteNames.get(site._id) ?? "",
          scannedAt: s.scannedAt,
          gpsValid: s.gpsValid,
        });
      }
    }
    return all.sort((a, b) => b.scannedAt - a.scannedAt).slice(0, limit);
  },
});

export const portalReports = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Clients only ever see reports staff have explicitly SENT — never drafts,
    // and never guard-submitted internal reports (those stay staff-only).
    const submissions = (await ctx.db
      .query("reportSubmissions")
      .withIndex("by_clientId_submittedAt", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(200))
      .filter((s) => s.status === "sent")
      .slice(0, 50);
    // Report titles embed the submitting officer's name — scrub it (AGM rule).
    return await Promise.all(
      submissions.map(async (s) => {
        const officer = await ctx.db.get(s.userId);
        return {
          id: s.legacyId ?? s._id,
          title: scrubOfficerName(s.title, officer?.name),
          type: s.type,
          submittedAt: s.submittedAt,
        };
      }),
    );
  },
});

export const portalGuardStats = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const sites = await ctx.db
      .query("sites")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .collect();

    const guardIds = new Set<string>();
    for (const site of sites) {
      const assignments = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_siteId", (q) => q.eq("siteId", site._id))
        .collect();
      for (const assignment of assignments) guardIds.add(assignment.userId);
    }

    let assigned = 0;
    let clockedIn = 0;
    for (const guardId of guardIds) {
      const guard = await ctx.db.get(guardId as any);
      if (!guard || (guard as any).role !== "guard" || !(guard as any).active) continue;
      assigned += 1;
      const activeShift = await ctx.db
        .query("shifts")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", guardId as any).eq("status", "active"),
        )
        .first();
      if (activeShift) clockedIn += 1;
    }

    return { assigned, clockedIn, pending: assigned - clockedIn };
  },
});

export const portalCheckpoints = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const sites = await ctx.db
      .query("sites")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .collect();
    const results: Array<{
      id: string
      name: string
      code: string
      siteLabel: string
      latitude: number | null
      longitude: number | null
      hitRate: null
      lastScanAt: number | null
    }> = [];
    for (const site of sites) {
      const checkpoints = await ctx.db
        .query("checkpoints")
        .withIndex("by_siteId", (q) => q.eq("siteId", site._id))
        .collect();
      for (const cp of checkpoints) {
        if (!cp.active) continue;
        const lastScan = await ctx.db
          .query("scans")
          .withIndex("by_checkpointId_scannedAt", (q) => q.eq("checkpointId", cp._id))
          .order("desc")
          .first();
        results.push({
          id: cp._id,
          name: cp.name,
          code: cp.code,
          siteLabel: site.name,
          latitude: cp.latitude ?? null,
          longitude: cp.longitude ?? null,
          hitRate: null,
          lastScanAt: lastScan?.scannedAt ?? null,
        });
      }
    }
    return results;
  },
});
