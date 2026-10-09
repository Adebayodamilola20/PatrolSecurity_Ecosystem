/// <reference types="vite/client" />
/**
 * Late-scan alerts: flagged one minute past the start time (Nigerian time),
 * raised once per checkpoint per day, closed by the first scan.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { minutesLate, parseStartTime, watDay } from "./lateScans";

const modules = import.meta.glob("./**/*.*s");

// 9 Oct 2026, 09:00 WAT = 08:00 UTC.
const NINE_WAT = Date.UTC(2026, 9, 9, 8, 0, 0);
const MIN = 60_000;

async function seed(t: ReturnType<typeof convexTest>, opts?: { posted?: boolean }) {
  return await t.run(async (ctx) => {
    const created = NINE_WAT - 3 * 24 * 60 * MIN;
    const clientId = await ctx.db.insert("clients", {
      name: "Late Test Client", email: "ops@late.test", phone: "+2348000000000",
      active: true, createdAt: created,
    });
    const siteId = await ctx.db.insert("sites", {
      clientId, name: "Rayfield", location: "Jos", active: true, createdAt: created,
    });
    const checkpointId = await ctx.db.insert("checkpoints", {
      clientId, siteId, name: "Main Gate", code: "RAY-1", isPrimary: true,
      expectedIntervalMinutes: 60, scheduledTimeIn: "09:00", scheduledTimeOut: "",
      active: true, createdAt: created,
    });
    const guardId = await ctx.db.insert("users", {
      name: "Musa Guard", email: "musa@late.test", passwordHash: "x", role: "guard",
      phone: "+2348000000001", active: true, liveTracking: false, createdAt: created,
    });
    if (opts?.posted !== false) {
      await ctx.db.insert("userSiteAssignments", { clientId, userId: guardId, siteId, createdAt: created });
    }
    return { checkpointId, guardId };
  });
}

async function scanAt(t: ReturnType<typeof convexTest>, ids: { checkpointId: any; guardId: any }, at: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("scans", {
      officerId: ids.guardId, checkpointId: ids.checkpointId, scannedAt: at, receivedAt: at,
      gpsValid: true, notes: "",
    });
  });
}

const alerts = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => await ctx.db.query("lateScanAlerts").collect());

describe("time helpers", () => {
  test("WAT day and start time", () => {
    // 23:30 UTC on the 8th is 00:30 WAT on the 9th.
    expect(watDay(Date.UTC(2026, 9, 8, 23, 30)).serviceDate).toBe("2026-10-09");
    expect(watDay(NINE_WAT).dayStartUtc + 9 * 60 * MIN).toBe(NINE_WAT);
    expect(parseStartTime("9:00")).toBe(540);
    expect(parseStartTime("")).toBeNull();
    expect(parseStartTime("25:00")).toBeNull();
    expect(minutesLate(NINE_WAT, NINE_WAT + 23 * MIN + 30_000)).toBe(23);
  });
});

describe("late scan check", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.LATE_SCAN_ALERTS = "on";
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.LATE_SCAN_ALERTS;
  });

  test("nothing at 09:00:30, flagged at 09:01, raised only once", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    vi.setSystemTime(NINE_WAT + 30_000);
    await t.mutation(internal.lateScans.check, {});
    expect(await alerts(t)).toHaveLength(0);

    vi.setSystemTime(NINE_WAT + MIN);
    await t.mutation(internal.lateScans.check, {});
    vi.setSystemTime(NINE_WAT + 5 * MIN);
    await t.mutation(internal.lateScans.check, {});
    const rows = await alerts(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("open");
    expect(rows[0].guardNames).toEqual(["Musa Guard"]);

    const listed = await t.query(internal.lateScans.list, { status: "open" });
    expect(listed[0].lateMinutes).toBe(5);
    vi.runOnlyPendingTimers();
  });

  test("on-time scan raises nothing", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await scanAt(t, ids, NINE_WAT - 10 * MIN);
    vi.setSystemTime(NINE_WAT + 10 * MIN);
    await t.mutation(internal.lateScans.check, {});
    expect(await alerts(t)).toHaveLength(0);
  });

  test("late scan closes the alert with the final lateness", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    vi.setSystemTime(NINE_WAT + 2 * MIN);
    await t.mutation(internal.lateScans.check, {});
    await scanAt(t, ids, NINE_WAT + 23 * MIN);
    vi.setSystemTime(NINE_WAT + 24 * MIN);
    await t.mutation(internal.lateScans.check, {});
    const [row] = await alerts(t);
    expect(row.status).toBe("resolved");
    expect(row.lateMinutes).toBe(23);
    vi.runOnlyPendingTimers();
  });

  test("no scan all day becomes missed the next day", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    vi.setSystemTime(NINE_WAT + 2 * MIN);
    await t.mutation(internal.lateScans.check, {});
    vi.setSystemTime(NINE_WAT + 16 * 60 * MIN); // 01:00 WAT next day
    await t.mutation(internal.lateScans.check, {});
    const [row] = await alerts(t);
    expect(row.status).toBe("missed");
    vi.runOnlyPendingTimers();
  });

  test("a checkpoint nobody is posted to is not flagged", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { posted: false });
    vi.setSystemTime(NINE_WAT + 10 * MIN);
    await t.mutation(internal.lateScans.check, {});
    expect(await alerts(t)).toHaveLength(0);
  });

  test("off unless LATE_SCAN_ALERTS=on", async () => {
    delete process.env.LATE_SCAN_ALERTS;
    const t = convexTest(schema, modules);
    await seed(t);
    vi.setSystemTime(NINE_WAT + 10 * MIN);
    await t.mutation(internal.lateScans.check, {});
    expect(await alerts(t)).toHaveLength(0);
  });
});
