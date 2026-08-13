import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { recordTombstone } from "./lib/tombstones";

export const findByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const getSafeProfile = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.active) {
      return null;
    }

    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const client = user.clientId ? await ctx.db.get(user.clientId) : null;

    return {
      id: user.legacyId ?? user._id,
      convexId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      active: user.active,
      clientId: user.clientId,
      clientName: client?.name ?? null,
      liveTracking: user.liveTracking,
      siteIds: assignments.map((assignment) => assignment.siteId),
    };
  },
});

export const listAll = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let users = await ctx.db.query("users").collect()
    if (args.clientId) users = users.filter(u => u.clientId === args.clientId)
    return Promise.all(users.map(async (u) => {
      const client = u.clientId ? await ctx.db.get(u.clientId) : null
      const shifts = await ctx.db
        .query("shifts")
        .withIndex("by_userId", (q) => q.eq("userId", u._id))
        .collect()
      const activeShift = shifts.find((s) => s.status === "active")
      const lastClockInShift = shifts
        .filter((s) => s.clockIn)
        .sort((a, b) => b.clockIn - a.clockIn)[0]
      const lastClockOutShift = shifts
        .filter((s) => s.clockOut)
        .sort((a, b) => (b.clockOut ?? 0) - (a.clockOut ?? 0))[0]
      // Where they are posted, on the roster itself — scanning a list of
      // names to find who is unassigned should not need a click per person.
      const assignments = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId", (q) => q.eq("userId", u._id))
        .collect()
      const assignedSiteNames = (
        await Promise.all(
          assignments.map(async (a) => (await ctx.db.get(a.siteId))?.name ?? null),
        )
      ).filter((name): name is string => !!name)

      // Where this person actually is, for the live map.
      //
      // The map used to plot a guard at their most recent *scan*, which put
      // someone who clocked in at one location on top of a different one they
      // had scanned earlier. The live position beats the clock-in fix, and
      // the clock-in fix beats nothing — a scan is history, not a location.
      let livePosition: {
        latitude: number;
        longitude: number;
        recordedAt: number;
        source: "live" | "clock_in";
      } | null = null;
      if (activeShift) {
        const latest = await ctx.db
          .query("officerPositions")
          .withIndex("by_userId_capturedAt", (q) => q.eq("userId", u._id))
          .order("desc")
          .first();
        if (latest && latest.capturedAt >= activeShift.clockIn) {
          livePosition = {
            latitude: latest.latitude,
            longitude: latest.longitude,
            recordedAt: latest.capturedAt,
            source: "live",
          };
        } else if (
          activeShift.clockInLatitude != null &&
          activeShift.clockInLongitude != null
        ) {
          livePosition = {
            latitude: activeShift.clockInLatitude,
            longitude: activeShift.clockInLongitude,
            recordedAt: activeShift.clockIn,
            source: "clock_in",
          };
        }
      }
      return {
        id: u.legacyId ?? u._id,
        convexId: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone,
        active: u.active,
        clientId: u.clientId,
        clientName: client?.name ?? null,
        assignedSiteNames,
        liveTracking: u.liveTracking,
        createdAt: new Date(u.createdAt).toISOString(),
        onDuty: !!activeShift,
        liveLatitude: livePosition?.latitude ?? null,
        liveLongitude: livePosition?.longitude ?? null,
        livePositionAt: livePosition
          ? new Date(livePosition.recordedAt).toISOString()
          : null,
        livePositionSource: livePosition?.source ?? null,
        lastClockIn: lastClockInShift?.clockIn ? new Date(lastClockInShift.clockIn).toISOString() : null,
        lastClockOut: lastClockOutShift?.clockOut ? new Date(lastClockOutShift.clockOut).toISOString() : null,
      }
    }))
  },
});

export const getById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.userId);
    if (!u) return null;
    const client = u.clientId ? await ctx.db.get(u.clientId) : null;
    return { id: u.legacyId ?? u._id, convexId: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, active: u.active, clientId: u.clientId, clientName: client?.name ?? null, liveTracking: u.liveTracking, createdAt: new Date(u.createdAt).toISOString() };
  },
});

export const create = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("main_account"), v.literal("supervisor"), v.literal("guard")),
    phone: v.string(),
    active: v.boolean(),
    clientId: v.optional(v.id("clients")),
    liveTracking: v.boolean(),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("users", args);
    return id;
  },
});

/**
 * How much of a guard's record a delete would touch. Read before the confirm
 * dialog so staff are told what survives rather than guessing — the counts
 * that are *kept* are the reassuring half of the message.
 */
export const getDeletionImpact = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const [scans, shifts, incidents, assignments] = await Promise.all([
      ctx.db
        .query("scans")
        .withIndex("by_officerId", (q) => q.eq("officerId", args.userId))
        .collect(),
      ctx.db
        .query("shifts")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("incidents")
        .withIndex("by_officerId", (q) => q.eq("officerId", args.userId))
        .collect(),
      ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect(),
    ]);
    const siteNames = await Promise.all(
      assignments.map(async (a) => (await ctx.db.get(a.siteId))?.name ?? null),
    );
    // Deleting the only admin would leave nobody able to administer the
    // system — including nobody able to create a replacement admin.
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    return {
      name: user.name,
      role: user.role,
      isLastAdmin: user.role === "admin" && admins.length <= 1,
      onDuty: shifts.some((s) => s.status === "active"),
      scans: scans.length,
      shifts: shifts.length,
      incidents: incidents.length,
      assignedSites: siteNames.filter((n): n is string => !!n),
    };
  },
});

/**
 * Hard-deletes a guard's profile: the account, its logins and its postings.
 *
 * Patrol history — scans, shifts, incidents, reports — is deliberately left
 * behind. It is the evidence trail for nights the guard actually worked, and a
 * client or the police can still ask about those nights after the guard is
 * gone; a tombstone keeps their name readable on it.
 *
 * An open shift is closed first. An `active` shift whose user no longer exists
 * would otherwise keep a deleted guard on duty forever on the live map.
 */
export const remove = internalMutation({
  args: {
    userId: v.id("users"),
    deletedByUserId: v.optional(v.id("users")),
    deletedByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const openShifts = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();
    const now = Date.now();
    for (const shift of openShifts) {
      await ctx.db.patch(shift._id, {
        status: "completed",
        clockOut: shift.clockOut ?? now,
      });
    }

    // Sessions go first: an in-flight refresh must not be able to outlive the
    // profile it belongs to.
    const tokens = await ctx.db
      .query("refreshTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);

    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const assignment of assignments) await ctx.db.delete(assignment._id);

    // Gate postings too, or a deleted guard keeps holding the front gate on
    // every location screen with no way to take them off it.
    const postings = await ctx.db
      .query("userCheckpointAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const posting of postings) await ctx.db.delete(posting._id);

    // Live GPS telemetry rather than evidence — it is purged on a schedule
    // anyway, and leaving it puts a nameless dot on the live map.
    const positions = await ctx.db
      .query("officerPositions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const position of positions) await ctx.db.delete(position._id);

    await recordTombstone(ctx, {
      entityType: "user",
      entityId: args.userId,
      name: user.name,
      deletedByUserId: args.deletedByUserId,
      deletedByName: args.deletedByName,
    });

    await ctx.db.delete(args.userId);

    return {
      name: user.name,
      role: user.role,
      shiftsClosed: openShifts.length,
      sessionsRevoked: tokens.length,
      assignmentsRemoved: assignments.length,
      positionsRemoved: positions.length,
    };
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("users")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) return byLegacyId._id;
    // Not a legacy id, so it should be a Convex one. This used to read
    // the whole table and scan it for a matching _id — on scans, the
    // largest table here, that is the entire patrol history loaded to
    // answer "does this id exist". normalizeId answers it directly.
    const normalized = ctx.db.normalizeId("users", args.id);
    if (!normalized) return null;
    return (await ctx.db.get(normalized)) ? normalized : null;
  },
});

export const getDetail = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const found = await ctx.db.get(args.userId);
    if (!found) return null;
    const client = found.clientId ? await ctx.db.get(found.clientId) : null;
    const shifts = await ctx.db
      .query("shifts")
      .withIndex("by_userId", (q) => q.eq("userId", found._id))
      .order("desc")
      .take(20);
    const checkpoints = await ctx.db.query("checkpoints").collect();
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_officerId", (q) => q.eq("officerId", found._id))
      .order("desc")
      .take(20);
    const activeShift = shifts.find((s) => s.status === "active");
    const onDuty = !!activeShift;

    // Where this person is posted. The profile could say whether they were
    // clocked in but not where they were expected to be, which is the first
    // thing anyone opening the page wants to know.
    const siteAssignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", found._id))
      .collect();
    const checkpointPostings = await ctx.db
      .query("userCheckpointAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", found._id))
      .collect();
    const assignedLocations = (
      await Promise.all(
        siteAssignments.map(async (assignment) => {
          const site = await ctx.db.get(assignment.siteId);
          if (!site) return null;
          const siteClient = await ctx.db.get(site.clientId);
          return {
            siteId: site._id,
            siteName: site.name,
            clientId: site.clientId,
            clientName: siteClient?.name ?? null,
            // The specific gates they hold at this location, in the order
            // they were posted to them.
            subLocations: checkpointPostings
              .filter((posting) => posting.siteId === site._id)
              .map(
                (posting) =>
                  checkpoints.find((cp) => cp._id === posting.checkpointId)?.name,
              )
              .filter((name): name is string => !!name),
          };
        }),
      )
    ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const lastClockInShift = shifts
      .filter((s) => s.clockIn)
      .sort((a, b) => b.clockIn - a.clockIn)[0];
    const lastClockOutShift = shifts
      .filter((s) => s.clockOut)
      .sort((a, b) => (b.clockOut ?? 0) - (a.clockOut ?? 0))[0];
    return {
      id: found.legacyId ?? found._id,
      convexId: found._id,
      name: found.name,
      email: found.email,
      role: found.role,
      phone: found.phone,
      active: found.active,
      clientId: found.clientId,
      clientName: client?.name ?? null,
      liveTracking: found.liveTracking,
      createdAt: new Date(found.createdAt).toISOString(),
      onDuty,
      assignedLocations,
      lastClockIn: lastClockInShift?.clockIn ? new Date(lastClockInShift.clockIn).toISOString() : null,
      lastClockOut: lastClockOutShift?.clockOut ? new Date(lastClockOutShift.clockOut).toISOString() : null,
      shifts: shifts.map((s) => ({
        id: s.legacyId ?? s._id,
        clockIn: s.clockIn ? new Date(s.clockIn).toISOString() : null,
        clockOut: s.clockOut ? new Date(s.clockOut).toISOString() : null,
        status: s.status,
        scheduledStart: s.scheduledStart ? new Date(s.scheduledStart).toISOString() : null,
        scheduledEnd: s.scheduledEnd ? new Date(s.scheduledEnd).toISOString() : null,
        createdAt: new Date(s.createdAt).toISOString(),
      })),
      scans: scans.map((s) => ({
        id: s.legacyId ?? s._id,
        checkpointId: s.checkpointId,
        checkpointName: checkpoints.find((c) => c._id === s.checkpointId)?.name ?? "",
        checkpointCode: checkpoints.find((c) => c._id === s.checkpointId)?.code ?? "",
        scannedAt: new Date(s.scannedAt).toISOString(),
        receivedAt: new Date(s.receivedAt).toISOString(),
        gpsLatitude: s.gpsLatitude,
        gpsLongitude: s.gpsLongitude,
        gpsValid: s.gpsValid,
        distanceMeters: s.distanceMeters,
        notes: s.notes,
        checkpointActive: checkpoints.find((c) => c._id === s.checkpointId)?.active ?? true,
      })),
    };
  },
});

export const changePassword = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
    });
  },
});

/**
 * Edit a person's profile in place.
 *
 * Patches the existing row rather than writing a new one: every scan, shift,
 * incident and posting points at this id, so a "corrected" duplicate would
 * silently orphan the entire history behind the old name. Only the fields
 * actually sent are touched.
 */
export const updateProfile = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("admin"),
        v.literal("main_account"),
        v.literal("supervisor"),
        v.literal("guard"),
      ),
    ),
    active: v.optional(v.boolean()),
    liveTracking: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, ...fields } = args;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const email = fields.email?.trim().toLowerCase();
    if (email && email !== user.email.toLowerCase()) {
      // The login looks accounts up by email, so two rows sharing one would
      // make which account you reach a matter of insertion order.
      const clash = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (clash && clash._id !== userId) {
        throw new Error("Another account already uses that email address");
      }
    }

    // Demoting the last admin leaves nobody able to administer the system,
    // including nobody able to promote a replacement.
    if (fields.role && fields.role !== "admin" && user.role === "admin") {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      if (admins.filter((a) => a.active).length <= 1) {
        throw new Error("This is the last active admin — promote someone else first");
      }
    }

    const patch: Record<string, unknown> = {};
    if (fields.name?.trim()) patch.name = fields.name.trim();
    if (email) patch.email = email;
    if (fields.phone != null) patch.phone = fields.phone.trim();
    if (fields.role) patch.role = fields.role;
    if (fields.active != null) patch.active = fields.active;
    if (fields.liveTracking != null) patch.liveTracking = fields.liveTracking;
    await ctx.db.patch(userId, patch);

    const updated = await ctx.db.get(userId);
    return {
      id: updated?.legacyId ?? userId,
      convexId: userId,
      name: updated?.name,
      email: updated?.email,
      phone: updated?.phone,
      role: updated?.role,
      active: updated?.active,
    };
  },
});

/**
 * Administrative password reset.
 *
 * The hash is computed in the HTTP layer and only the hash reaches here —
 * there is deliberately no way to read an existing password back out, so a
 * forgotten one is replaced, never revealed.
 *
 * Every refresh token for the account is revoked in the same breath. A reset
 * that leaves the old sessions alive protects nobody: the usual reason for
 * resetting is that someone else has the account.
 */
export const adminResetPassword = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { passwordHash: args.passwordHash });

    const tokens = await ctx.db
      .query("refreshTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    let revoked = 0;
    const now = Date.now();
    for (const token of tokens) {
      if (token.revokedAt) continue;
      await ctx.db.patch(token._id, { revokedAt: now });
      revoked++;
    }
    return { name: user.name, sessionsRevoked: revoked };
  },
});
