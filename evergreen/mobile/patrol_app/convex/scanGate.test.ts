/// <reference types="vite/client" />
/**
 * Tests for the two rules a patrol scan has to pass before it becomes
 * evidence: the guard was actually there, and the patrol started at the front
 * of the property.
 *
 * These run against `internal.scans.create` rather than the HTTP route on
 * purpose. The route is not the only door into a scan, and the requirement is
 * that the rule lives on the server — a check that only exists in the Flutter
 * UI is bypassed by anyone willing to edit a request body, which is exactly
 * what the old `gpsValid = true` default allowed.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

// A gate at the office, and a point 500m away — far outside any radius here.
const SITE_LAT = 6.5244;
const SITE_LNG = 3.3792;
const FAR_LAT = 6.5289;
const FAR_LNG = 3.3792;

async function seed(t: ReturnType<typeof convexTest>, opts?: { siteHasGps?: boolean }) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const clientId = await ctx.db.insert("clients", {
      name: "Gate Test Client",
      email: "ops@gatetest.test",
      phone: "+2348000000000",
      active: true,
      createdAt: now,
    });
    const siteId = await ctx.db.insert("sites", {
      clientId,
      name: "Gbagada",
      location: "Gbagada",
      ...(opts?.siteHasGps === false
        ? {}
        : { latitude: SITE_LAT, longitude: SITE_LNG, radiusMeters: 100 }),
      active: true,
      createdAt: now,
    });
    const makeCheckpoint = async (name: string, code: string, isPrimary: boolean) =>
      await ctx.db.insert("checkpoints", {
        clientId,
        siteId,
        name,
        code,
        isPrimary,
        expectedIntervalMinutes: 30,
        scheduledTimeIn: "18:00",
        scheduledTimeOut: "06:00",
        active: true,
        createdAt: now,
      });
    const locationQr = await makeCheckpoint("Location QR", "GBAGADA-MAIN", true);
    const frontGate = await makeCheckpoint("Front Gate", "GBAGADA-1", false);

    const guardId = await ctx.db.insert("users", {
      name: "Ade Guard",
      email: "ade.guard@gatetest.test",
      passwordHash: "not-a-real-hash",
      role: "guard",
      phone: "+2348000000001",
      active: true,
      liveTracking: false,
      createdAt: now,
    });
    await ctx.db.insert("userSiteAssignments", {
      clientId,
      userId: guardId,
      siteId,
      createdAt: now,
    });
    await ctx.db.insert("shifts", {
      clientId,
      siteId,
      userId: guardId,
      status: "active",
      clockIn: now - 60 * 60 * 1000,
      clockInPhoto: "test-photo",
      siteLabel: "Gbagada",
      createdAt: now - 60 * 60 * 1000,
    });

    return { clientId, siteId, locationQr, frontGate, guardId };
  });
}

type World = Awaited<ReturnType<typeof seed>>;

describe("GPS verification is enforced on the server", () => {
  let t: ReturnType<typeof convexTest>;
  let w: World;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    w = await seed(t);
  });

  const scan = (checkpointId: Id<"checkpoints">, lat?: number, lng?: number) =>
    t.mutation(internal.scans.create, {
      officerId: w.guardId,
      checkpointId,
      ...(lat != null ? { gpsLatitude: lat } : {}),
      ...(lng != null ? { gpsLongitude: lng } : {}),
    });

  test("a scan carrying no coordinates is refused, not trusted", async () => {
    // The old default marked exactly this case verified.
    await expect(scan(w.locationQr)).rejects.toThrow(/location/i);
    const scans = await t.run((ctx) => ctx.db.query("scans").collect());
    expect(scans).toHaveLength(0);
  });

  test("a scan from outside the geofence is refused", async () => {
    await expect(scan(w.locationQr, FAR_LAT, FAR_LNG)).rejects.toThrow(/away from Gbagada/);
    const scans = await t.run((ctx) => ctx.db.query("scans").collect());
    expect(scans).toHaveLength(0);
  });

  test("a scan from inside the geofence is recorded and verified", async () => {
    await scan(w.locationQr, SITE_LAT, SITE_LNG);
    const scans = await t.run((ctx) => ctx.db.query("scans").collect());
    expect(scans).toHaveLength(1);
    expect(scans[0].gpsValid).toBe(true);
  });

  test("a location with no map point records the scan but never as verified", async () => {
    const t2 = convexTest(schema, modules);
    const w2 = await seed(t2, { siteHasGps: false });
    await t2.mutation(internal.scans.create, {
      officerId: w2.guardId,
      checkpointId: w2.locationQr,
    });
    const scans = await t2.run((ctx) => ctx.db.query("scans").collect());
    expect(scans).toHaveLength(1);
    expect(scans[0].gpsValid).toBe(false);
  });
});

describe("a post order is only revealed by a verified scan", () => {
  let t: ReturnType<typeof convexTest>;
  let w: World;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    w = await seed(t);
    await t.mutation(internal.postOrders.create, {
      instructions: "Check the rear entrance every 30 minutes.",
      checkpointId: w.frontGate,
      createdBy: w.guardId,
    });
  });

  const visibleToGuard = async () =>
    await t.query(internal.postOrders.listForUser, { userId: w.guardId });

  const scanAt = (checkpointId: Id<"checkpoints">, lat: number, lng: number) =>
    t.mutation(internal.scans.create, {
      officerId: w.guardId,
      checkpointId,
      gpsLatitude: lat,
      gpsLongitude: lng,
    });

  test("nothing is visible before the guard has scanned the point", async () => {
    expect(await visibleToGuard()).toHaveLength(0);
  });

  test("a refused scan reveals nothing", async () => {
    // Entrance first, so the only thing failing below is the geofence.
    await scanAt(w.locationQr, SITE_LAT, SITE_LNG);
    await expect(scanAt(w.frontGate, FAR_LAT, FAR_LNG)).rejects.toThrow();
    expect(await visibleToGuard()).toHaveLength(0);
  });

  test("a verified scan of that point reveals it", async () => {
    await scanAt(w.locationQr, SITE_LAT, SITE_LNG);
    await scanAt(w.frontGate, SITE_LAT, SITE_LNG);
    const orders = await visibleToGuard();
    expect(orders).toHaveLength(1);
    expect(orders[0].instructions).toContain("rear entrance");
  });

  test("scanning a different point does not reveal it", async () => {
    await scanAt(w.locationQr, SITE_LAT, SITE_LNG);
    expect(await visibleToGuard()).toHaveLength(0);
  });
});

describe("a patrol has to start at the location QR", () => {
  let t: ReturnType<typeof convexTest>;
  let w: World;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    w = await seed(t);
  });

  const scanAt = (checkpointId: Id<"checkpoints">) =>
    t.mutation(internal.scans.create, {
      officerId: w.guardId,
      checkpointId,
      gpsLatitude: SITE_LAT,
      gpsLongitude: SITE_LNG,
    });

  test("a sub-location scanned before the entrance is refused", async () => {
    await expect(scanAt(w.frontGate)).rejects.toThrow(/main entrance/i);
    const scans = await t.run((ctx) => ctx.db.query("scans").collect());
    expect(scans).toHaveLength(0);
  });

  test("the same scan succeeds once the entrance has been scanned", async () => {
    await scanAt(w.locationQr);
    await scanAt(w.frontGate);
    const scans = await t.run((ctx) => ctx.db.query("scans").collect());
    expect(scans).toHaveLength(2);
  });
});
