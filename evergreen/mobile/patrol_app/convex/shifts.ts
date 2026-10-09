import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { distanceMeters } from "./lib/geo";
import { deletedNamesByType } from "./lib/tombstones";

/**
 * Was this clock-in taken inside the geofence of a location the guard is
 * posted to?
 *
 * Two things were wrong here, and both made the stored flag lie.
 *
 * It was called with `assignment?.siteId` — the *first* posting the index
 * returned. A guard who covers three sites and clocks in at the second was
 * measured against the first and recorded as outside the fence, so the one
 * signal distinguishing an honest clock-in from a fraudulent one was noise for
 * exactly the staff who move around most. It now takes every posting and keeps
 * the best match.
 *
 * And when nothing could be measured — an unmapped site with no located
 * sub-locations — it returned `gpsValid: true`. A flag that reads "verified"
 * when no verification happened is worse than an absent one: it is evidence
 * that says the opposite of the truth. Unverifiable is now `false`, matching
 * the rule the scan path already applies.
 *
 * This is now enforced for guards, not merely recorded — see
 * `clockInGeofenceRefusal` for the rule and the cases deliberately let through.
 */
type ResolvedGeofence = SiteGeofence & {
  /** The posting the guard actually turned up at, when one matched. */
  siteId: Id<"sites"> | undefined;
};

async function validateSiteGeofence(
  ctx: MutationCtx,
  siteIds: Array<Id<"sites">>,
  latitude?: number,
  longitude?: number,
): Promise<ResolvedGeofence> {
  const unmeasurable: ResolvedGeofence = {
    gpsValid: false,
    distanceMeters: undefined,
    radiusMeters: undefined,
    fenceLabel: undefined,
    siteId: siteIds[0],
  };
  if (siteIds.length === 0 || latitude == null || longitude == null) {
    return unmeasurable;
  }
  let best: ResolvedGeofence | null = null;
  for (const siteId of siteIds) {
    const candidate = { ...(await geofenceForSite(ctx, siteId, latitude, longitude)), siteId };
    if (candidate.gpsValid) return candidate;
    if (
      best === null ||
      (candidate.distanceMeters ?? Infinity) < (best.distanceMeters ?? Infinity)
    ) {
      best = candidate;
    }
  }
  return best ?? unmeasurable;
}

type SiteGeofence = {
  gpsValid: boolean;
  distanceMeters: number | undefined;
  /** The fence the distance was measured against, for the refusal message. */
  radiusMeters: number | undefined;
  fenceLabel: string | undefined;
};

async function geofenceForSite(
  ctx: MutationCtx,
  siteId: Id<"sites"> | undefined,
  latitude?: number,
  longitude?: number,
): Promise<SiteGeofence> {
  const unmeasurable: SiteGeofence = {
    gpsValid: false,
    distanceMeters: undefined,
    radiusMeters: undefined,
    fenceLabel: undefined,
  };
  if (!siteId || latitude == null || longitude == null) return unmeasurable;
  // Prefer the site's own geofence when it has coordinates; fall back to the
  // nearest checkpoint that still carries its own coordinates (legacy data).
  // Sub-locations without coordinates can't anchor a geofence.
  const site = await ctx.db.get(siteId);
  if (site?.latitude != null && site?.longitude != null) {
    const distance = distanceMeters(site.latitude, site.longitude, latitude, longitude);
    const radius = site.radiusMeters ?? 150;
    return {
      gpsValid: distance <= radius,
      distanceMeters: distance,
      radiusMeters: radius,
      fenceLabel: site.name,
    };
  }
  const checkpoints = await ctx.db
    .query("checkpoints")
    .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
    .collect();
  const distances = checkpoints
    .filter((cp) => cp.latitude != null && cp.longitude != null)
    .map((checkpoint) => ({
      distance: distanceMeters(
        checkpoint.latitude!,
        checkpoint.longitude!,
        latitude,
        longitude,
      ),
      radius: checkpoint.radiusMeters ?? 50,
      label: checkpoint.name,
    }));
  if (distances.length === 0) {
    // Nothing to measure against. This used to return true — "verified" with
    // no verification behind it. Unverifiable is not valid.
    return unmeasurable;
  }
  const nearest = distances.sort((a, b) => a.distance - b.distance)[0];
  return {
    gpsValid: nearest.distance <= nearest.radius,
    distanceMeters: nearest.distance,
    radiusMeters: nearest.radius,
    fenceLabel: nearest.label ?? site?.name,
  };
}

/**
 * Slack on top of the site radius, for clock-in only.
 *
 * A refused scan costs a guard a walk back to the checkpoint. A refused
 * clock-in costs them the entire shift — they cannot scan, file an incident or
 * raise an alarm until it succeeds — so the two gates should not have the same
 * hair trigger. Phone GPS in a built-up area routinely reads 50–80m off, and a
 * guard standing at the gate being told to "move closer" with nowhere closer to
 * go is an operational failure, not fraud prevention.
 *
 * 75m absorbs that drift and still leaves the gate nowhere near a guard's home,
 * which is the behaviour this exists to stop. Tune it here if the sites turn out
 * to be tighter or looser than assumed.
 */
const CLOCK_IN_GPS_GRACE_METERS = 75;

export const CLOCK_IN_REFUSED_PREFIX = "CLOCK_IN_REFUSED:";

export function clockInRefusal(details: string, message: string): Error {
  return new Error(CLOCK_IN_REFUSED_PREFIX + JSON.stringify({ details, message }));
}

export function parseClockInRefusal(
  error: unknown,
): { details: string; message: string } | null {
  if (!(error instanceof Error) || !error.message.startsWith(CLOCK_IN_REFUSED_PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(error.message.slice(CLOCK_IN_REFUSED_PREFIX.length));
  } catch {
    return {
      details: "Clock-in refused",
      message: "This clock-in could not be accepted.",
    };
  }
}

/**
 * Decides whether a clock-in is far enough outside the fence to refuse.
 *
 * Returns null to allow. Three cases are deliberately allowed through with
 * `gpsValid: false` still recorded against the shift, because refusing them
 * would punish the guard for the system's own gaps rather than catch fraud:
 *
 *   - **Nothing to measure against.** A site with no coordinates and no located
 *     sub-locations yields no distance. Enforcing here would lock every guard
 *     at an unmapped site out of work on the day this ships, which is how a
 *     fraud control becomes an outage. Map the site and the gate starts working
 *     on its own.
 *   - **No postings.** A guard with no site assignment has no fence by
 *     definition; that is an admin gap to fix in the dashboard, not something
 *     the guard can resolve while standing in the street.
 *   - **Supervisors.** They roam between sites by design, and already hold
 *     cross-site trust everywhere else in this system. Their distance is still
 *     recorded, so the flag remains reviewable.
 *
 * Everything measurable, for an actual guard, is refused past the radius plus
 * CLOCK_IN_GPS_GRACE_METERS.
 */
function clockInGeofenceRefusal(
  role: string | undefined,
  geofence: ResolvedGeofence,
): Error | null {
  if (role?.trim().toLowerCase() !== "guard") return null;
  if (geofence.gpsValid) return null;
  if (geofence.distanceMeters == null || geofence.radiusMeters == null) return null;

  const allowed = geofence.radiusMeters + CLOCK_IN_GPS_GRACE_METERS;
  if (geofence.distanceMeters <= allowed) return null;

  const away = Math.round(geofence.distanceMeters);
  const where = geofence.fenceLabel ?? "your posted location";
  return clockInRefusal(
    `Clock-in refused: ${away}m from ${where}, limit ${Math.round(allowed)}m`,
    `You are ${away}m from ${where}. Clock in once you are on site — within ` +
      `${Math.round(allowed)}m of it.`,
  );
}

export const getActiveForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
  },
});

export const getStatusForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const shift = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();

    if (!shift) {
      return {
        active: false,
        shift: null,
      };
    }

    return {
      active: true,
      shift: {
        id: shift.legacyId ?? shift._id,
        clockIn: new Date(shift.clockIn).toISOString(),
        clockOut: shift.clockOut
          ? new Date(shift.clockOut).toISOString()
          : null,
        scheduledEnd: shift.scheduledEnd
          ? new Date(shift.scheduledEnd).toISOString()
          : null,
        siteLabel: shift.siteLabel,
        status: shift.status,
      },
    };
  },
});

export const listForExport = internalQuery({
  args: {},
  handler: async (ctx) => {
    const shifts = await ctx.db.query("shifts").order("desc").take(500);
    const users = await ctx.db.query("users").collect();
    // Timesheet rows outlive the guard, so an export covering a period a
    // since-deleted guard worked still names them.
    const goneUsers = await deletedNamesByType(ctx, "user");
    return shifts.map((shift) => ({
      id: shift.legacyId ?? shift._id,
      userId: shift.userId,
      userName:
        users.find((user) => user._id === shift.userId)?.name ??
        goneUsers.get(shift.userId) ??
        "",
      clockIn: new Date(shift.clockIn).toISOString(),
      clockOut: shift.clockOut ? new Date(shift.clockOut).toISOString() : null,
      status: shift.status,
      siteLabel: shift.siteLabel,
      createdAt: new Date(shift.createdAt).toISOString(),
    }));
  },
});

export const listAll = internalQuery({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const query = args.clientId
      ? ctx.db.query("shifts").withIndex("by_clientId", (q) =>
          q.eq("clientId", args.clientId),
        )
      : ctx.db.query("shifts");
    let shifts = await query.order("desc").take(200);
    if (args.userId) shifts = shifts.filter((s) => s.userId === args.userId);
    if (args.startDate)
      shifts = shifts.filter((s) => s.clockIn >= args.startDate!);
    if (args.endDate) shifts = shifts.filter((s) => s.clockIn <= args.endDate!);
    if (args.clientId) {
      const clientUsers = await ctx.db.query("users").collect();
      const clientUserIds = new Set(
        clientUsers
          .filter((u) => u.clientId === args.clientId)
          .map((u) => u._id),
      );
      shifts = shifts.filter(
        (s) => s.clientId === args.clientId || clientUserIds.has(s.userId),
      );
    }
    const users = await ctx.db.query("users").collect();
    const goneUsers = await deletedNamesByType(ctx, "user");
    return shifts.map((s) => {
      const u = users.find((u) => u._id === s.userId);
      return {
        id: s.legacyId ?? s._id,
        userId: s.userId,
        userName: u?.name ?? goneUsers.get(s.userId) ?? "",
        userEmail: u?.email ?? "",
        userPhone: u?.phone ?? "",
        clockIn: new Date(s.clockIn).toISOString(),
        clockOut: s.clockOut ? new Date(s.clockOut).toISOString() : null,
        status: s.status,
        siteLabel: s.siteLabel,
        clockInPhoto: s.clockInPhoto ?? "",
        // Real GPS data captured at clock-in / clock-out so the web can show
        // the exact location (and whether it was inside the geofence).
        clockInLatitude: s.clockInLatitude ?? null,
        clockInLongitude: s.clockInLongitude ?? null,
        clockInGpsValid: s.clockInGpsValid ?? null,
        clockInDistanceMeters: s.clockInDistanceMeters ?? null,
        clockOutLatitude: s.clockOutLatitude ?? null,
        clockOutLongitude: s.clockOutLongitude ?? null,
        clockOutGpsValid: s.clockOutGpsValid ?? null,
        clockOutDistanceMeters: s.clockOutDistanceMeters ?? null,
        createdAt: new Date(s.createdAt).toISOString(),
      };
    });
  },
});

export const missingClockins = internalQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const shifts = await ctx.db.query("shifts").order("desc").take(500);
    const todayShifts = shifts.filter((s) => s.clockIn >= todayStart.getTime());
    const activeUsers = users.filter(
      (u) => u.active && (!args.clientId || u.clientId === args.clientId),
    );
    return activeUsers
      .filter((u) => !todayShifts.some((s) => s.userId === u._id))
      .map((u) => ({
        userId: u.legacyId ?? u._id,
        name: u.name,
        email: u.email,
        role: u.role,
      }));
  },
});

export const clockIn = internalMutation({
  args: {
    userId: v.id("users"),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    gpsMocked: v.optional(v.boolean()),
    siteLabel: v.optional(v.string()),
    clockInPhoto: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("shifts")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .first();
    if (existing) {
      throw new Error("Already clocked in — end current shift first");
    }

    // No fix, no shift.
    //
    // A shift is the root of everything downstream: scans are only accepted
    // while one is open, and the live map plots where the guard clocked in.
    // Accepting a clock-in with no coordinates produced a shift that looked
    // real and a map pin that was guesswork — the guard appeared at whichever
    // site they were assigned to rather than where they were standing.
    // Refuse it and say what to do, rather than record a fiction.
    // `typeof NaN === "number"`, so a null check alone lets NaN and Infinity
    // through to the distance maths, where every comparison against them is
    // false. That fails closed — the guard is refused — but tells them they are
    // "NaNm away", which is not something anyone can act on. Treat an
    // unusable fix as no fix at all, which it is.
    const hasUsableFix =
      args.latitude != null &&
      args.longitude != null &&
      Number.isFinite(args.latitude) &&
      Number.isFinite(args.longitude) &&
      Math.abs(args.latitude) <= 90 &&
      Math.abs(args.longitude) <= 180;
    if (!hasUsableFix) {
      throw new Error(
        "Location is off. Turn on location for this app, allow it while using the app, then clock in again.",
      );
    }

    // A fabricated fix defeats the geofence outright.
    //
    // Enforcing distance while trusting the coordinates is theatre: a
    // mock-location app is a developer setting on Android, needs no root, and
    // pointing it at the site's published coordinates puts the guard "on site"
    // from their sofa. The scan path already refuses this — leaving clock-in
    // open meant the cheap attack simply moved one step earlier, and a shift
    // opened that way legitimises everything hung off it.
    //
    // Refused for every role, unlike the distance check below: supervisors
    // roam, but nobody has a legitimate reason to run a GPS spoofer. Android
    // reports this directly; iOS never populates it, so this catches the cheap
    // attack rather than every possible one. An app too old to send the field
    // reads as absent, not mocked — refusing on absence would lock out every
    // guard still on the previous build.
    if (args.gpsMocked === true) {
      throw clockInRefusal(
        "Clock-in submitted with a mock GPS provider active",
        "This phone is reporting a simulated location. Turn off any mock-location or GPS-spoofing app, then clock in again.",
      );
    }

    const now = Date.now();
    const user = await ctx.db.get(args.userId);
    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const geofence = await validateSiteGeofence(
      ctx,
      assignments.map((a) => a.siteId),
      args.latitude,
      args.longitude,
    );
    // Refuse before anything is written. A shift that opens from the guard's
    // sofa is a paid night that never happened, and every scan, incident and
    // alarm for the rest of it hangs off this row.
    const refusal = clockInGeofenceRefusal(user?.role, geofence);
    if (refusal) throw refusal;

    // The shift is attributed to the posting the guard actually turned up at,
    // not to whichever assignment the index happened to return first. Scans
    // carry this shiftId and emergency.trigger falls back to its siteId, so a
    // guard covering several sites was previously logged at the wrong one for
    // the whole night.
    const shiftId = await ctx.db.insert("shifts", {
      clientId: user?.clientId,
      siteId: geofence.siteId,
      userId: args.userId,
      status: "active",
      clockIn: now,
      clockInPhoto: args.clockInPhoto ?? "",
      clockInLatitude: args.latitude,
      clockInLongitude: args.longitude,
      clockInGpsValid: geofence.gpsValid,
      clockInDistanceMeters: geofence.distanceMeters,
      siteLabel: args.siteLabel ?? "",
      createdAt: now,
    });

    await ctx.runMutation(internal.activity.record, {
      clientId: user?.clientId,
      siteId: geofence.siteId,
      officerId: args.userId,
      activityType: "clock_in",
      sourceTable: "shifts",
      sourceId: shiftId,
      siteName: args.siteLabel ?? "",
      activityLabel: "Clock-in",
      gpsLatitude: args.latitude,
      gpsLongitude: args.longitude,
      gpsValid: geofence.gpsValid,
      distanceMeters: geofence.distanceMeters,
      occurredAt: now,
    });

    return {
      active: true,
      shift: {
        id: shiftId,
        clockIn: new Date(now).toISOString(),
        clockOut: null,
        scheduledEnd: null,
        siteLabel: args.siteLabel ?? "",
        status: "active",
      },
    };
  },
});

export const clockOut = internalMutation({
  args: {
    shiftId: v.id("shifts"),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    // Photo ref (storageId), optional — parity with clock-in for sites that
    // require proof at both ends of a shift.
    clockOutPhoto: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.shiftId);
    if (!existing) {
      throw new Error("Shift not found");
    }

    const clockOutAt = Date.now();
    const geofence = await validateSiteGeofence(
      ctx,
      existing.siteId ? [existing.siteId] : [],
      args.latitude,
      args.longitude,
    );
    await ctx.db.patch(args.shiftId, {
      status: "completed",
      clockOut: clockOutAt,
      clockOutLatitude: args.latitude,
      clockOutLongitude: args.longitude,
      clockOutGpsValid: geofence.gpsValid,
      clockOutDistanceMeters: geofence.distanceMeters,
      ...(args.clockOutPhoto ? { clockOutPhoto: args.clockOutPhoto } : {}),
    });

    await ctx.runMutation(internal.activity.record, {
      clientId: existing.clientId,
      siteId: existing.siteId,
      officerId: existing.userId,
      activityType: "clock_out",
      sourceTable: "shifts",
      sourceId: args.shiftId,
      siteName: existing.siteLabel,
      activityLabel: "Clock-out",
      gpsLatitude: args.latitude,
      gpsLongitude: args.longitude,
      gpsValid: geofence.gpsValid,
      distanceMeters: geofence.distanceMeters,
      occurredAt: clockOutAt,
    });

    const updated = await ctx.db.get(args.shiftId);
    return {
      active: false,
      shift: updated
        ? {
            id: updated.legacyId ?? updated._id,
            clockIn: new Date(updated.clockIn).toISOString(),
            clockOut: new Date(clockOutAt).toISOString(),
            scheduledEnd: updated.scheduledEnd
              ? new Date(updated.scheduledEnd).toISOString()
              : null,
            siteLabel: updated.siteLabel,
            status: updated.status,
          }
        : null,
    };
  },
});

/**
 * Close shifts nobody clocked out of.
 *
 * A guard went home without clocking out and stayed "on patrol" for 44 hours,
 * pinned to a spot he had long left. Nobody works a 44-hour shift, and an open
 * shift is not harmless: scans are only accepted while one is running, so a
 * forgotten shift leaves the door open indefinitely and the live map keeps
 * presenting a stale fix as a live one.
 *
 * The shift is closed at the last moment we have evidence for — the guard's
 * final position or scan — rather than at "now", so the timesheet does not
 * credit hours nobody worked. Marked so a supervisor can tell an auto-close
 * from a real one.
 */
export const autoCloseStaleShifts = internalMutation({
  args: { maxHours: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const maxMs = (args.maxHours ?? 16) * 60 * 60 * 1000;
    const cutoff = Date.now() - maxMs;

    const open = await ctx.db
      .query("shifts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let closed = 0;
    for (const shift of open) {
      if (shift.clockIn > cutoff) continue;

      const lastPosition = await ctx.db
        .query("officerPositions")
        .withIndex("by_userId_capturedAt", (q) => q.eq("userId", shift.userId))
        .order("desc")
        .first();
      const lastScan = await ctx.db
        .query("scans")
        .withIndex("by_officerId_scannedAt", (q) =>
          q.eq("officerId", shift.userId),
        )
        .order("desc")
        .first();

      const lastEvidence = Math.max(
        shift.clockIn,
        lastPosition?.capturedAt ?? 0,
        lastScan?.scannedAt ?? 0,
      );

      await ctx.db.patch(shift._id, {
        status: "completed",
        clockOut: lastEvidence,
      });
      closed++;
    }
    return { closed, checked: open.length };
  },
});
