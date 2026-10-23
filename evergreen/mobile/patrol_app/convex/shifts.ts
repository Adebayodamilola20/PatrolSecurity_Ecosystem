import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { distanceMeters } from "./lib/geo";
import { deletedNamesByType, findDeletedCheckpoint } from "./lib/tombstones";
import { markedPayload, recordAcceptedScan, scanFence } from "./scans";
import { resolveCheckpointRef } from "./checkpoints";
import { readRequireQrCheckIn } from "./settings";

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
  // Same production error shape as scans; see markedPayload.
  const payload = markedPayload(error, CLOCK_IN_REFUSED_PREFIX);
  if (payload === null) return null;
  try {
    return JSON.parse(payload);
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
        checkInMethod: shift.checkInMethod,
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
      checkInMethod: shift.checkInMethod,
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
        // "qr" when the guard scanned the entrance QR, "gps" for a GPS-only
        // clock-in, undefined for shifts from before the QR check-in existed —
        // which the dashboard must show as unknown, not as either method.
        checkInMethod: s.checkInMethod,
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

/**
 * The text a guard's phone decoded from a QR, reduced to the id it carries.
 *
 * The dashboard prints QRs as `<site>/checkpoints/<id>` links, and the app has
 * always cut the id off the end before sending it to POST /scans. The clock-in
 * contract takes the decoded text exactly as read, so the same cut happens
 * here — a URL is accepted, and so is a bare id from an app that already
 * stripped it.
 */
function qrIdFromDecodedText(raw: string): string {
  const text = raw.trim();
  if (/^https?:\/\//i.test(text)) {
    try {
      const segments = new URL(text).pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] ?? "";
    } catch {
      return text.split("/").filter(Boolean).pop() ?? "";
    }
  }
  return text;
}

const SCAN_THE_ENTRANCE_QR =
  "Scan the QR code at the main entrance of your location.";

/**
 * The location a scanned clock-in code proves the guard is standing at, or a
 * refusal saying exactly why it does not.
 *
 * Resolved here, inside the mutation, rather than in the route: the internal
 * mutation is a second door into a shift, and a check that only the route
 * performs is one refactor from gone. The resolver is the one POST /scans uses
 * (see resolveCheckpointRef), so a code means the same thing at clock-in as it
 * does on patrol.
 *
 * Every refusal is a `clockInRefusal`, never a bare Error: on a deployed
 * backend the route sees "Uncaught Error: ..." plus a stack line, and only the
 * marker survives that intact.
 */
async function resolveClockInLocation(
  ctx: MutationCtx,
  userId: Id<"users">,
  locationCode: string,
): Promise<{ checkpoint: Doc<"checkpoints">; site: Doc<"sites"> }> {
  const ref = qrIdFromDecodedText(locationCode);
  const checkpointId = ref ? await resolveCheckpointRef(ctx, ref) : null;
  const checkpoint = checkpointId ? await ctx.db.get(checkpointId) : null;

  // A location the company has withdrawn is told to ring the office, not to
  // keep rescanning — the same distinction POST /scans draws with its 410.
  // Nothing is named: by now the posting that would entitle this guard to the
  // name has been deleted along with the location.
  const withdrawn = clockInRefusal(
    "Clock-in QR belongs to a withdrawn location",
    "This location is no longer serviced by the company, so you cannot clock in here. Please contact the office.",
  );

  if (!checkpoint) {
    if (ref && (await findDeletedCheckpoint(ctx, ref))) throw withdrawn;
    throw clockInRefusal(
      "Clock-in QR not recognised",
      `This QR code is not recognised. ${SCAN_THE_ENTRANCE_QR}`,
    );
  }

  const site = checkpoint.siteId ? await ctx.db.get(checkpoint.siteId) : null;
  // The checkpoint row outlived its location's cascade: withdrawn in every way
  // that matters to the guard at the gate.
  if (checkpoint.siteId && !site) throw withdrawn;

  // Only the location's own QR opens a shift. A sub-location proves the guard
  // reached that point, not that they arrived at the property — and accepting
  // one would let a shift start at the back fence, which is the hole the
  // "location QR first" rule in scans.create exists to close.
  if (!checkpoint.isPrimary) {
    throw clockInRefusal(
      "Clock-in attempted with a patrol point QR, not the location QR",
      `That is a patrol point, not the clock-in code. ${SCAN_THE_ENTRANCE_QR}`,
    );
  }
  if (!site) {
    // A primary point with no location is a data fault, not something the
    // guard can fix by scanning again.
    throw clockInRefusal(
      "Clock-in QR is marked as a location QR but belongs to no location",
      "This QR code is not attached to a location, so you cannot clock in with it. Please contact the office.",
    );
  }

  // Every role, unlike the distance rule below. The location scan recorded with
  // this shift has to be one scans.create would accept, and scans.create
  // accepts nobody at a site they are not posted to. A roaming supervisor who
  // is not posted here still has the GPS clock-in.
  const posted = await ctx.db
    .query("userSiteAssignments")
    .withIndex("by_userId_siteId", (q) => q.eq("userId", userId).eq("siteId", site._id))
    .first();
  if (!posted) {
    throw clockInRefusal(
      `Clock-in QR scanned at ${site.name}, where the guard is not posted`,
      `You are not posted to ${site.name}. Ask your supervisor to assign you.`,
    );
  }

  // Switched off rather than deleted: still the company's call, so still the
  // office's number to ring. Checked after the posting so that only someone
  // posted here learns the state of the place.
  if (!site.active) {
    throw clockInRefusal(
      `Clock-in QR scanned at inactive location ${site.name}`,
      `${site.name} is not an active location, so you cannot clock in here. Please contact the office.`,
    );
  }
  if (!checkpoint.active) {
    throw clockInRefusal(
      `Clock-in QR at ${site.name} has been switched off`,
      `The entrance QR code at ${site.name} has been switched off by the company, so you cannot clock in with it. Please contact the office.`,
    );
  }

  return { checkpoint, site };
}

/**
 * Whether this guard, with the QR requirement on, could have clocked in by QR.
 *
 * Only a posting with a working entrance QR counts: an active location whose
 * own QR point exists and is switched on. Demanding a scan of a code that is
 * not on the wall — a location created before entrance QRs, or one whose QR
 * the office has switched off — would leave the guard no way to start work at
 * all, which is a lock-out, not a control.
 */
async function hasScannableEntranceQr(
  ctx: MutationCtx,
  siteIds: Array<Id<"sites">>,
): Promise<boolean> {
  for (const siteId of siteIds) {
    const site = await ctx.db.get(siteId);
    if (!site?.active) continue;
    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
      .collect();
    if (checkpoints.some((cp) => cp.isPrimary && cp.active)) return true;
  }
  return false;
}

export const clockIn = internalMutation({
  args: {
    userId: v.id("users"),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    gpsMocked: v.optional(v.boolean()),
    siteLabel: v.optional(v.string()),
    clockInPhoto: v.optional(v.string()),
    /**
     * The text decoded from the location's main-entrance QR. Present: a QR
     * check-in, verified against that one location. Absent: the GPS clock-in
     * every older build uses, and the "Can't scan?" fallback.
     */
    locationCode: v.optional(v.string()),
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

    const user = await ctx.db.get(args.userId);
    const isGuard = user?.role?.trim().toLowerCase() === "guard";
    // Blank is absent: an app that sends an empty field has not scanned
    // anything, and is held to the same rule as one that sent nothing.
    const locationCode = args.locationCode?.trim() ? args.locationCode : undefined;
    const assignments = await ctx.db
      .query("userSiteAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    // The QR requirement, when the company has switched it on.
    //
    // Checked first, before anything about the fix: the answer to an app that
    // did not scan is "scan", and telling an old build to turn its location on
    // only to refuse it again afterwards wastes the guard's first two tries.
    // Guards only — supervisors roam between sites and are not posted to an
    // entrance. And only where the guard has an entrance QR they could scan.
    if (
      !locationCode &&
      isGuard &&
      (await readRequireQrCheckIn(ctx)) &&
      (await hasScannableEntranceQr(ctx, assignments.map((a) => a.siteId)))
    ) {
      throw clockInRefusal(
        "Clock-in without the location QR while QR check-in is required",
        "Scan the location QR code at the main entrance to clock in.",
      );
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

    if (locationCode) {
      return await clockInByLocationQr(ctx, {
        userId: args.userId,
        user,
        locationCode,
        latitude: args.latitude!,
        longitude: args.longitude!,
        gpsMocked: args.gpsMocked,
        clockInPhoto: args.clockInPhoto,
        now,
      });
    }

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
      checkInMethod: "gps",
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

    // Named only when the guard's position was actually measured against that
    // site. With nothing to measure, the shift still falls back to the first
    // posting, but telling the guard "clocked in at X" on that basis would be
    // a guess presented as a fact.
    const matchedSite =
      geofence.siteId && geofence.distanceMeters != null
        ? await ctx.db.get(geofence.siteId)
        : null;

    return {
      active: true,
      shift: {
        id: shiftId,
        clockIn: new Date(now).toISOString(),
        clockOut: null,
        scheduledEnd: null,
        siteLabel: args.siteLabel ?? "",
        status: "active",
        checkInMethod: "gps" as const,
      },
      checkIn: {
        method: "gps" as const,
        verified: geofence.gpsValid,
        ...(matchedSite ? { siteName: matchedSite.name } : {}),
      },
    };
  },
});

/**
 * A clock-in proven by scanning the location's main-entrance QR.
 *
 * One transaction opens the shift AND records the scan of that QR, so the two
 * cannot come apart: no shift without its proof, no orphan scan from a
 * clock-in that failed. The scan goes through the same recorder as POST /scans
 * (recordAcceptedScan), which is what lets a patrol guard walk straight on to
 * the sub-locations — the "location QR first" rule finds this scan — and makes
 * reports, analytics and missed-patrol tracking count it like any other.
 *
 * The admission rule is the clock-in one, not the scan one. A guard at the
 * gate with drifting GPS is let in within the clock-in grace (see
 * CLOCK_IN_GPS_GRACE_METERS) even where a patrol scan would refuse them; the
 * scan row then honestly records gpsValid=false and the distance, rather than
 * the scan's stricter fence costing the guard their whole shift.
 */
async function clockInByLocationQr(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    user: Doc<"users"> | null;
    locationCode: string;
    latitude: number;
    longitude: number;
    gpsMocked?: boolean;
    clockInPhoto?: string;
    now: number;
  },
) {
  const { user, now } = args;
  const { checkpoint, site } = await resolveClockInLocation(
    ctx,
    args.userId,
    args.locationCode,
  );

  // Measured against the fence of the location the QR belongs to — the guard
  // has said where they are, so their other postings are irrelevant here.
  const geofence: ResolvedGeofence = {
    ...(await geofenceForSite(ctx, site._id, args.latitude, args.longitude)),
    siteId: site._id,
  };
  const refusal = clockInGeofenceRefusal(user?.role, geofence);
  if (refusal) throw refusal;

  const shiftId = await ctx.db.insert("shifts", {
    clientId: user?.clientId,
    siteId: site._id,
    userId: args.userId,
    status: "active",
    clockIn: now,
    clockInPhoto: args.clockInPhoto ?? "",
    clockInLatitude: args.latitude,
    clockInLongitude: args.longitude,
    clockInGpsValid: geofence.gpsValid,
    clockInDistanceMeters: geofence.distanceMeters,
    checkInMethod: "qr",
    // The verified location, not whatever label the phone sent: the QR has
    // already settled where this shift is.
    siteLabel: site.name,
    createdAt: now,
  });

  await ctx.runMutation(internal.activity.record, {
    clientId: user?.clientId,
    siteId: site._id,
    officerId: args.userId,
    activityType: "clock_in",
    sourceTable: "shifts",
    sourceId: shiftId,
    siteName: site.name,
    activityLabel: "Clock-in",
    gpsLatitude: args.latitude,
    gpsLongitude: args.longitude,
    gpsValid: geofence.gpsValid,
    distanceMeters: geofence.distanceMeters,
    occurredAt: now,
  });

  // The location scan, measured exactly as POST /scans would measure it.
  const fence = scanFence(checkpoint, site);
  const scanDistance = fence
    ? distanceMeters(fence.lat, fence.lng, args.latitude, args.longitude)
    : undefined;
  const locationScan = await recordAcceptedScan(ctx, {
    officerId: args.userId,
    officer: user,
    checkpoint,
    shiftId,
    // Clock-in time, so the scan sits inside the shift it opened and the
    // "location QR first" rule (scannedAt >= clockIn) finds it.
    scannedAt: now,
    receivedAt: now,
    gpsLatitude: args.latitude,
    gpsLongitude: args.longitude,
    gpsMocked: args.gpsMocked,
    gpsValid: fence != null && scanDistance! <= fence.radius,
    distanceMeters: scanDistance,
    unverifiable: fence == null,
  });
  await ctx.db.patch(shiftId, { checkInScanId: locationScan.id });

  return {
    active: true,
    shift: {
      id: shiftId,
      clockIn: new Date(now).toISOString(),
      clockOut: null,
      scheduledEnd: null,
      siteLabel: site.name,
      status: "active",
      checkInMethod: "qr" as const,
    },
    checkIn: {
      method: "qr" as const,
      verified: true,
      siteName: site.name,
    },
    // The scan exactly as POST /scans would have answered it, including any
    // post orders the location QR triggers, so the app can show them the same
    // way it does after any other scan.
    locationScan,
  };
}

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
            checkInMethod: updated.checkInMethod,
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
