/// <reference types="vite/client" />
/**
 * Authorization regression tests for the findings in the 2026-08-09 review.
 *
 * Two complete tenants are built for every test — two security companies'
 * worth of guards, sites, checkpoints and records — because every one of these
 * bugs was a row reachable by id from outside the tenant that owns it, and a
 * single-tenant fixture cannot tell a real check from a missing one.
 *
 * Requests go through `t.fetch`, so what is under test is the same stack a
 * phone or a browser reaches: token verification, the role gate on the route,
 * and the scope check in the mutation behind it. Assertions on the internal
 * mutations sit alongside, because the route is not the only door into a row
 * and a check that only exists there is one refactor from being gone.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { signPatrolToken } from "./lib/jwt";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

type World = Awaited<ReturnType<typeof seed>>;

// The API only parses a body when it is declared as JSON, so every request
// carries the content type a real client sends.
const auth = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();

    const makeUser = async (
      name: string,
      role: "admin" | "supervisor" | "main_account" | "guard",
      clientId?: Id<"clients">,
    ) =>
      await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.test`,
        // Never used: these tests authenticate with signed tokens, not passwords.
        passwordHash: "not-a-real-hash",
        role,
        phone: "+2348000000000",
        active: true,
        clientId,
        liveTracking: false,
        createdAt: now,
      });

    const makeClient = async (name: string) =>
      await ctx.db.insert("clients", {
        name,
        email: `ops@${name.toLowerCase().replace(/\s+/g, "")}.test`,
        phone: "+2348000000001",
        active: true,
        createdAt: now,
      });

    const alphaClient = await makeClient("Alpha Retail Group");
    const bravoClient = await makeClient("Bravo Logistics");

    const alphaSite = await ctx.db.insert("sites", {
      clientId: alphaClient,
      name: "Alpha Ikeja Warehouse",
      location: "Ikeja",
      active: true,
      createdAt: now,
    });
    const bravoSite = await ctx.db.insert("sites", {
      clientId: bravoClient,
      name: "Bravo Apapa Depot",
      location: "Apapa",
      active: true,
      createdAt: now,
    });

    const makeCheckpoint = async (
      name: string,
      code: string,
      siteId: Id<"sites">,
      clientId: Id<"clients">,
      active = true,
    ) =>
      await ctx.db.insert("checkpoints", {
        clientId,
        siteId,
        name,
        code,
        expectedIntervalMinutes: 60,
        scheduledTimeIn: "18:00",
        scheduledTimeOut: "06:00",
        active,
        createdAt: now,
      });

    const alphaCheckpoint = await makeCheckpoint(
      "Alpha Main Gate",
      "ALPHA-GATE-001",
      alphaSite,
      alphaClient,
    );
    const bravoCheckpoint = await makeCheckpoint(
      "Bravo Tank Farm Gate",
      "BRAVO-GATE-001",
      bravoSite,
      bravoClient,
    );
    const bravoInactiveCheckpoint = await makeCheckpoint(
      "Bravo Rear Fence",
      "BRAVO-FENCE-009",
      bravoSite,
      bravoClient,
      false,
    );

    // Staff carry no clientId: they work for the security company, not for one
    // of its customers. Guards are tied to a tenant only by site assignment.
    const admin = await makeUser("Ada Admin", "admin");
    const supervisor = await makeUser("Sam Supervisor", "supervisor");
    const alphaPortal = await makeUser("Alpha Portal", "main_account", alphaClient);
    const alphaGuard = await makeUser("Ade Guard", "guard");
    const alphaRelief = await makeUser("Bola Relief", "guard");
    const bravoGuard = await makeUser("Chidi Guard", "guard");

    const assign = async (userId: Id<"users">, siteId: Id<"sites">, clientId: Id<"clients">) => {
      await ctx.db.insert("userSiteAssignments", {
        clientId,
        userId,
        siteId,
        createdAt: now,
      });
    };
    await assign(alphaGuard, alphaSite, alphaClient);
    await assign(alphaRelief, alphaSite, alphaClient);
    await assign(bravoGuard, bravoSite, bravoClient);

    const alphaIncident = await ctx.db.insert("incidents", {
      clientId: alphaClient,
      siteId: alphaSite,
      officerId: alphaGuard,
      title: "Perimeter light out",
      description: "North fence floodlight not working",
      severity: "low",
      status: "open",
      reportedAt: now,
    });
    const bravoIncident = await ctx.db.insert("incidents", {
      clientId: bravoClient,
      siteId: bravoSite,
      officerId: bravoGuard,
      title: "Attempted break-in at tank farm",
      description: "Two men seen at the rear fence",
      severity: "high",
      status: "open",
      reportedAt: now,
    });

    const makeHandover = async (
      fromUserId: Id<"users">,
      siteId: Id<"sites">,
      clientId: Id<"clients">,
      siteLabel: string,
      openIssues: string,
      toUserId?: Id<"users">,
    ) =>
      await ctx.db.insert("handovers", {
        clientId,
        siteId,
        siteLabel,
        fromUserId,
        toUserId,
        summary: `Shift notes for ${siteLabel}`,
        openIssues,
        equipmentStatus: "Torch battery low",
        status: "pending",
        acceptedNote: "",
        createdAt: now,
      });

    const alphaHandover = await makeHandover(
      alphaGuard,
      alphaSite,
      alphaClient,
      "Alpha Ikeja Warehouse",
      "Alpha gate motor sticking",
    );
    const bravoHandover = await makeHandover(
      bravoGuard,
      bravoSite,
      bravoClient,
      "Bravo Apapa Depot",
      "Bravo tanker bay light out",
    );
    const addressedHandover = await makeHandover(
      alphaGuard,
      alphaSite,
      alphaClient,
      "Alpha Ikeja Warehouse",
      "Alpha rear fence gap",
      alphaRelief,
    );

    // The escalation roster: who gets rung when a guard raises an emergency.
    await ctx.db.insert("communicationSettings", {
      scopeType: "global",
      scopeId: "",
      settingKey: "emergency_recipients",
      settingValue: JSON.stringify({
        email: "control.room@securecompany.test",
        phone: "+2348055512345",
      }),
      createdAt: now,
    });

    const tokenFor = async (userId: Id<"users">) => {
      const user = (await ctx.db.get(userId))!;
      return await signPatrolToken({
        userId,
        email: user.email,
        role: user.role,
      });
    };

    return {
      alphaClient,
      bravoClient,
      alphaSite,
      bravoSite,
      alphaCheckpoint,
      bravoCheckpoint,
      bravoInactiveCheckpoint,
      admin,
      supervisor,
      alphaPortal,
      alphaGuard,
      alphaRelief,
      bravoGuard,
      alphaIncident,
      bravoIncident,
      alphaHandover,
      bravoHandover,
      addressedHandover,
      tokens: {
        admin: await tokenFor(admin),
        supervisor: await tokenFor(supervisor),
        alphaPortal: await tokenFor(alphaPortal),
        alphaGuard: await tokenFor(alphaGuard),
        alphaRelief: await tokenFor(alphaRelief),
        bravoGuard: await tokenFor(bravoGuard),
      },
    };
  });
}

let t: ReturnType<typeof convexTest>;
let w: World;

beforeEach(async () => {
  t = convexTest(schema, modules);
  w = await seed(t);
});

describe("F1 — the emergency recipient list is admin-only", () => {
  const path = "/emergency/settings";

  test("an anonymous request is rejected", async () => {
    expect((await t.fetch(path, { method: "GET" })).status).toBe(401);
  });

  test("a forged token is rejected", async () => {
    const res = await t.fetch(path, {
      method: "GET",
      headers: auth("not.a.real.token"),
    });
    expect(res.status).toBe(401);
  });

  test("a guard is refused and learns nothing about the roster", async () => {
    const res = await t.fetch(path, {
      method: "GET",
      headers: auth(w.tokens.alphaGuard),
    });
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain("control.room@securecompany.test");
    expect(body).not.toContain("+2348055512345");
    expect(body).not.toContain("emergency_recipients");
  });

  test("a supervisor is refused: the roster is not part of that role", async () => {
    const res = await t.fetch(path, {
      method: "GET",
      headers: auth(w.tokens.supervisor),
    });
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("control.room@securecompany.test");
  });

  test("a client portal login cannot reach the staff API at all", async () => {
    const res = await t.fetch(path, {
      method: "GET",
      headers: auth(w.tokens.alphaPortal),
    });
    expect(res.status).toBe(401);
  });

  test("an admin still gets the roster", async () => {
    const res = await t.fetch(path, {
      method: "GET",
      headers: auth(w.tokens.admin),
    });
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].settingKey).toBe("emergency_recipients");
    expect(rows[0].settingValue).toContain("control.room@securecompany.test");
  });

  test("writing the roster is still admin-only", async () => {
    const body = JSON.stringify({
      settingKey: "emergency_recipients",
      settingValue: "attacker@evil.test",
    });
    const asGuard = await t.fetch(path, {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body,
    });
    expect(asGuard.status).toBe(403);
    const asAdmin = await t.fetch(path, {
      method: "POST",
      headers: auth(w.tokens.admin),
      body,
    });
    expect(asAdmin.status).toBe(201);
  });
});

describe("F2 — incident status is a control-room action", () => {
  const statusPath = (id: string) => `/incidents/${id}/status`;
  const resolve = JSON.stringify({ status: "resolved" });

  test("an admin resolving an incident still works", async () => {
    const res = await t.fetch(statusPath(w.alphaIncident), {
      method: "PATCH",
      headers: auth(w.tokens.admin),
      body: resolve,
    });
    expect(res.status).toBe(200);
    const after = await t.run((ctx) => ctx.db.get(w.alphaIncident));
    expect(after?.status).toBe("resolved");
    expect(after?.resolvedAt).toBeTypeOf("number");
  });

  test("a supervisor resolving an incident still works", async () => {
    const res = await t.fetch(statusPath(w.alphaIncident), {
      method: "PATCH",
      headers: auth(w.tokens.supervisor),
      body: resolve,
    });
    expect(res.status).toBe(200);
  });

  test("a guard cannot resolve the incident they filed themselves", async () => {
    const res = await t.fetch(statusPath(w.alphaIncident), {
      method: "PATCH",
      headers: auth(w.tokens.alphaGuard),
      body: resolve,
    });
    expect(res.status).toBe(403);
    const after = await t.run((ctx) => ctx.db.get(w.alphaIncident));
    expect(after?.status).toBe("open");
  });

  test("a guard cannot touch another company's incident", async () => {
    const res = await t.fetch(statusPath(w.bravoIncident), {
      method: "PATCH",
      headers: auth(w.tokens.alphaGuard),
      body: resolve,
    });
    expect(res.status).toBe(403);
    const after = await t.run((ctx) => ctx.db.get(w.bravoIncident));
    expect(after?.status).toBe("open");
  });

  test("a client portal token cannot resolve incidents", async () => {
    const res = await t.fetch(statusPath(w.alphaIncident), {
      method: "PATCH",
      headers: auth(w.tokens.alphaPortal),
      body: resolve,
    });
    expect(res.status).toBe(401);
  });

  test("an unknown id is a 404, not a crash", async () => {
    const res = await t.fetch(statusPath("kn7abcdefghijklmnopqrstuvwxyz012"), {
      method: "PATCH",
      headers: auth(w.tokens.admin),
      body: resolve,
    });
    expect(res.status).toBe(404);
  });

  test("swapping in a row from another table does not resolve to an incident", async () => {
    const res = await t.fetch(statusPath(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.admin),
      body: resolve,
    });
    expect(res.status).toBe(404);
    const handover = await t.run((ctx) => ctx.db.get(w.alphaHandover));
    expect(handover?.status).toBe("pending");
  });

  test("a status outside the allowed set is refused", async () => {
    const res = await t.fetch(statusPath(w.alphaIncident), {
      method: "PATCH",
      headers: auth(w.tokens.admin),
      body: JSON.stringify({ status: "deleted" }),
    });
    expect(res.status).toBe(400);
    const after = await t.run((ctx) => ctx.db.get(w.alphaIncident));
    expect(after?.status).toBe("open");
  });

  test("the mutation refuses a cross-tenant actor even when the route is bypassed", async () => {
    await expect(
      t.mutation(internal.incidents.updateStatus, {
        incidentId: w.bravoIncident,
        status: "resolved",
        actorRole: "guard",
        actorClientId: w.alphaClient,
      }),
    ).rejects.toThrow(/Access denied/);
    const after = await t.run((ctx) => ctx.db.get(w.bravoIncident));
    expect(after?.status).toBe("open");
  });

  test("the mutation refuses a non-staff actor with no tenant at all", async () => {
    await expect(
      t.mutation(internal.incidents.updateStatus, {
        incidentId: w.alphaIncident,
        status: "resolved",
        actorRole: "guard",
      }),
    ).rejects.toThrow(/Access denied/);
  });
});

describe("F3 — handovers belong to the post, not to whoever holds the id", () => {
  const accept = (id: string) => `/handovers/${id}/accept`;
  const status = (id: string) => `/handovers/${id}/status`;

  test("the relieving guard at that post can accept", async () => {
    const res = await t.fetch(accept(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.alphaRelief),
      body: JSON.stringify({ acceptedNote: "Taken over, gate motor noted" }),
    });
    expect(res.status).toBe(200);
    const after = await t.run((ctx) => ctx.db.get(w.alphaHandover));
    expect(after?.status).toBe("accepted");
    expect(after?.toUserId).toBe(w.alphaRelief);
  });

  test("a guard from another company cannot put their name on it", async () => {
    const res = await t.fetch(accept(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.bravoGuard),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const after = await t.run((ctx) => ctx.db.get(w.alphaHandover));
    expect(after?.status).toBe("pending");
    expect(after?.toUserId).toBeUndefined();
  });

  test("a handover passed to a named guard cannot be taken by a colleague", async () => {
    const res = await t.fetch(accept(w.addressedHandover), {
      method: "PATCH",
      headers: auth(w.tokens.alphaGuard),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const after = await t.run((ctx) => ctx.db.get(w.addressedHandover));
    expect(after?.status).toBe("pending");
  });

  test("a post already taken over cannot be taken again", async () => {
    const first = await t.fetch(accept(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.alphaRelief),
      body: JSON.stringify({}),
    });
    expect(first.status).toBe(200);
    const second = await t.fetch(accept(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.alphaGuard),
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(409);
    const after = await t.run((ctx) => ctx.db.get(w.alphaHandover));
    expect(after?.toUserId).toBe(w.alphaRelief);
  });

  test("the accept mutation refuses an outside guard on its own", async () => {
    await expect(
      t.mutation(internal.handovers.accept, {
        handoverId: w.alphaHandover,
        userId: w.bravoGuard,
        actorRole: "guard",
      }),
    ).rejects.toThrow(/Access denied/);
    const after = await t.run((ctx) => ctx.db.get(w.alphaHandover));
    expect(after?.toUserId).toBeUndefined();
  });

  test("changing the id to another company's handover changes nothing", async () => {
    const res = await t.fetch(accept(w.bravoHandover), {
      method: "PATCH",
      headers: auth(w.tokens.alphaRelief),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const after = await t.run((ctx) => ctx.db.get(w.bravoHandover));
    expect(after?.status).toBe("pending");
  });

  test("an id from another table is a 404", async () => {
    const res = await t.fetch(accept(w.alphaIncident), {
      method: "PATCH",
      headers: auth(w.tokens.alphaRelief),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  test("closing a handover is staff-only", async () => {
    const asGuard = await t.fetch(status(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.alphaGuard),
      body: JSON.stringify({ status: "closed" }),
    });
    expect(asGuard.status).toBe(403);

    const asOutsider = await t.fetch(status(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.bravoGuard),
      body: JSON.stringify({ status: "closed" }),
    });
    expect(asOutsider.status).toBe(403);

    expect((await t.run((ctx) => ctx.db.get(w.alphaHandover)))?.status).toBe("pending");

    const asAdmin = await t.fetch(status(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.admin),
      body: JSON.stringify({ status: "closed" }),
    });
    expect(asAdmin.status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(w.alphaHandover)))?.status).toBe("closed");
  });

  test("a status outside the allowed set is refused", async () => {
    const res = await t.fetch(status(w.alphaHandover), {
      method: "PATCH",
      headers: auth(w.tokens.admin),
      body: JSON.stringify({ status: "destroyed" }),
    });
    expect(res.status).toBe(400);
    expect((await t.run((ctx) => ctx.db.get(w.alphaHandover)))?.status).toBe("pending");
  });

  test("the pending list shows a guard only their own posts", async () => {
    const res = await t.fetch("/handovers/pending", {
      method: "GET",
      headers: auth(w.tokens.bravoGuard),
    });
    expect(res.status).toBe(200);
    const rows = await res.json();
    const labels = rows.map((row: any) => row.siteLabel);
    expect(labels).toContain("Bravo Apapa Depot");
    expect(labels).not.toContain("Alpha Ikeja Warehouse");
    // Not just the label — the shift notes themselves are the sensitive part.
    const raw = JSON.stringify(rows);
    expect(raw).not.toContain("Alpha gate motor sticking");
    expect(raw).not.toContain("Alpha rear fence gap");
    expect(raw).not.toContain("Ade Guard");
  });

  test("a guard still sees the post they are relieving", async () => {
    const res = await t.fetch("/handovers/pending", {
      method: "GET",
      headers: auth(w.tokens.alphaRelief),
    });
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((row: any) => row.siteLabel)).toContain("Alpha Ikeja Warehouse");
  });

  test("a guard cannot file a handover against another company's checkpoint", async () => {
    const res = await t.fetch("/handovers", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: JSON.stringify({
        summary: "Nothing to report",
        checkpointId: w.bravoCheckpoint,
      }),
    });
    expect(res.status).toBe(403);
    const all = await t.run((ctx) => ctx.db.query("handovers").collect());
    const filedAgainstBravo = all.filter((row) => row.clientId === w.bravoClient);
    expect(filedAgainstBravo.map((row) => row.fromUserId)).not.toContain(w.alphaGuard);
  });

  test("filing a handover at their own post still works", async () => {
    const res = await t.fetch("/handovers", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: JSON.stringify({
        summary: "Quiet night, gate motor still sticking",
        checkpointId: w.alphaCheckpoint,
        siteLabel: "Alpha Ikeja Warehouse",
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.status).toBe("pending");
  });
});

describe("F4 — a scanned code says nothing about a post the guard does not hold", () => {
  const lookup = (code: string) => `/checkpoints/lookup?code=${encodeURIComponent(code)}`;

  const namesThatMustNotLeak = [
    "Bravo Tank Farm Gate",
    "Bravo Rear Fence",
    "Bravo Apapa Depot",
    "Bravo Logistics",
    "Apapa",
  ];

  test("another company's code is refused without naming anything", async () => {
    const res = await t.fetch(lookup("BRAVO-GATE-001"), {
      method: "GET",
      headers: auth(w.tokens.alphaGuard),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("not_assigned");
    expect(body.name).toBeNull();
    expect(body.siteName).toBeNull();

    const raw = JSON.stringify(body);
    for (const name of namesThatMustNotLeak) expect(raw).not.toContain(name);
    expect(raw).not.toContain(w.bravoSite);
    expect(raw).not.toContain(w.bravoCheckpoint);
    expect(raw).not.toContain(w.bravoClient);
  });

  test("a switched-off code from another company reveals nothing either", async () => {
    const res = await t.fetch(lookup("BRAVO-FENCE-009"), {
      method: "GET",
      headers: auth(w.tokens.alphaGuard),
    });
    const body = await res.json();
    // Not "inactive" with a name attached: the caller has no claim on this row,
    // so why it cannot be scanned is not their answer to have.
    expect(body.status).toBe("not_assigned");
    expect(body.name).toBeNull();
    expect(body.siteName).toBeNull();
    for (const name of namesThatMustNotLeak) {
      expect(JSON.stringify(body)).not.toContain(name);
    }
  });

  test("looking the code up by its raw id discloses no more than by code", async () => {
    const res = await t.fetch(lookup(w.bravoCheckpoint), {
      method: "GET",
      headers: auth(w.tokens.alphaGuard),
    });
    const body = await res.json();
    expect(body.status).toBe("not_assigned");
    expect(body.name).toBeNull();
    expect(body.siteName).toBeNull();
  });

  test("a withdrawn location is reported without naming it", async () => {
    await t.run(async (ctx) => {
      const checkpoint = (await ctx.db.get(w.bravoCheckpoint))!;
      await ctx.db.insert("deletedEntities", {
        entityType: "checkpoint",
        entityId: checkpoint._id,
        contextName: "Bravo Apapa Depot",
        name: checkpoint.name,
        deletedAt: Date.now(),
      });
      await ctx.db.delete(w.bravoCheckpoint);
    });
    const res = await t.fetch(lookup(w.bravoCheckpoint), {
      method: "GET",
      headers: auth(w.tokens.alphaGuard),
    });
    const body = await res.json();
    expect(body.status).toBe("deleted");
    expect(body.name).toBeNull();
    expect(body.siteName).toBeNull();
    for (const name of namesThatMustNotLeak) {
      expect(JSON.stringify(body)).not.toContain(name);
    }
    // The guard is still told to ring the office, which is the part they act on.
    expect(body.message).toContain("no longer serviced");
  });

  test("a guard scanning their own post still gets the name they need", async () => {
    const res = await t.fetch(lookup("ALPHA-GATE-001"), {
      method: "GET",
      headers: auth(w.tokens.alphaGuard),
    });
    const body = await res.json();
    expect(body.status).toBe("active");
    expect(body.name).toBe("Alpha Main Gate");
    expect(body.siteName).toBe("Alpha Ikeja Warehouse");
  });

  test("an unrecognised code is still just unrecognised", async () => {
    const res = await t.fetch(lookup("NOT-A-REAL-CODE"), {
      method: "GET",
      headers: auth(w.tokens.alphaGuard),
    });
    expect((await res.json()).status).toBe("unknown");
  });

  test("an anonymous lookup is rejected", async () => {
    expect((await t.fetch(lookup("BRAVO-GATE-001"), { method: "GET" })).status).toBe(401);
  });
});

/**
 * Administrative personnel management.
 *
 * The requirement is that an admin can correct a profile and replace a
 * forgotten password, and that nobody else can — and that no route anywhere
 * hands a password back out.
 */
describe("personnel editing and password reset", () => {
  const editBody = JSON.stringify({ name: "Ade Guard Corrected", phone: "+2348099999999" });

  test("an admin edits the existing record rather than creating a second one", async () => {
    const before = await t.run((ctx) => ctx.db.query("users").collect());
    const res = await t.fetch(`/users/${w.alphaGuard}`, {
      method: "PUT",
      headers: auth(w.tokens.admin),
      body: editBody,
    });
    expect(res.status).toBe(200);
    const after = await t.run((ctx) => ctx.db.query("users").collect());
    expect(after).toHaveLength(before.length);
    const updated = await t.run((ctx) => ctx.db.get(w.alphaGuard));
    expect(updated?.name).toBe("Ade Guard Corrected");
    expect(updated?.phone).toBe("+2348099999999");
  });

  test("a guard cannot edit anyone, including themselves", async () => {
    const res = await t.fetch(`/users/${w.alphaGuard}`, {
      method: "PUT",
      headers: auth(w.tokens.alphaGuard),
      body: editBody,
    });
    expect(res.status).toBe(403);
  });

  test("a client portal account cannot edit personnel", async () => {
    const res = await t.fetch(`/users/${w.alphaGuard}`, {
      method: "PUT",
      headers: auth(w.tokens.alphaPortal),
      body: editBody,
    });
    // 401 rather than 403: a portal token cannot authenticate against a staff
    // route at all, which is a stronger refusal than failing the role check.
    expect([401, 403]).toContain(res.status);
  });

  test("an email already in use is refused", async () => {
    const res = await t.fetch(`/users/${w.alphaGuard}`, {
      method: "PUT",
      headers: auth(w.tokens.admin),
      body: JSON.stringify({ email: "bola.relief@example.test" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message ?? "").toMatch(/already uses/i);
  });

  test("an admin reset replaces the hash and revokes live sessions", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("refreshTokens", {
        userId: w.alphaGuard,
        tokenHash: "hash-of-a-live-session",
        familyId: "family-1",
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      });
    });
    const before = await t.run((ctx) => ctx.db.get(w.alphaGuard));
    const res = await t.fetch("/users/reset-password", {
      method: "POST",
      headers: auth(w.tokens.admin),
      body: JSON.stringify({ userId: w.alphaGuard, newPassword: "a-fresh-password" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).sessionsRevoked).toBe(1);
    const after = await t.run((ctx) => ctx.db.get(w.alphaGuard));
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
    const tokens = await t.run((ctx) => ctx.db.query("refreshTokens").collect());
    expect(tokens.every((token) => token.revokedAt)).toBe(true);
  });

  test("a supervisor cannot reset someone's password", async () => {
    const res = await t.fetch("/users/reset-password", {
      method: "POST",
      headers: auth(w.tokens.supervisor),
      body: JSON.stringify({ userId: w.alphaGuard, newPassword: "a-fresh-password" }),
    });
    expect(res.status).toBe(403);
  });

  test("a short password is refused", async () => {
    const res = await t.fetch("/users/reset-password", {
      method: "POST",
      headers: auth(w.tokens.admin),
      body: JSON.stringify({ userId: w.alphaGuard, newPassword: "short" }),
    });
    expect(res.status).toBe(400);
  });

  test("no profile route ever returns a password or its hash", async () => {
    const detail = await (
      await t.fetch(`/users/${w.alphaGuard}`, { method: "GET", headers: auth(w.tokens.admin) })
    ).json();
    const list = await (
      await t.fetch("/users", { method: "GET", headers: auth(w.tokens.admin) })
    ).json();
    const serialized = JSON.stringify({ detail, list });
    expect(serialized).not.toMatch(/passwordHash/);
    expect(serialized).not.toMatch(/not-a-real-hash/);
  });
});

/**
 * Client-written pass-ons.
 *
 * The old visibility rule was `!log.checkpointId || ...` — a pass-on with no
 * sub-location reached every guard on the platform. That was survivable while
 * only staff could write them and stops being survivable the moment a client
 * can, so the first test here is the leak itself.
 */
describe("client pass-on logs", () => {
  const passOn = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ title: "Extra patrol", instruction: "Walk the rear fence hourly", ...extra });

  test("a client can write a pass-on for its own location", async () => {
    const res = await t.fetch("/pass-on-logs", {
      method: "POST",
      headers: auth(w.tokens.alphaPortal),
      body: passOn({ siteId: w.alphaSite }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.siteId).toBe(w.alphaSite);
  });

  test("a client cannot write a pass-on onto another company's location", async () => {
    const res = await t.fetch("/pass-on-logs", {
      method: "POST",
      headers: auth(w.tokens.alphaPortal),
      body: passOn({ siteId: w.bravoSite }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message ?? "").toMatch(/does not belong/i);
    const logs = await t.run((ctx) => ctx.db.query("passOnLogs").collect());
    expect(logs).toHaveLength(0);
  });

  test("a client cannot address a guard who works for someone else", async () => {
    const res = await t.fetch("/pass-on-logs", {
      method: "POST",
      headers: auth(w.tokens.alphaPortal),
      body: passOn({ siteId: w.alphaSite, recipientUserIds: [w.bravoGuard] }),
    });
    expect(res.status).toBe(400);
    const logs = await t.run((ctx) => ctx.db.query("passOnLogs").collect());
    expect(logs).toHaveLength(0);
  });

  test("a client never sees another company's pass-ons", async () => {
    await t.fetch("/pass-on-logs", {
      method: "POST",
      headers: auth(w.tokens.admin),
      body: passOn({ title: "Bravo only", siteId: w.bravoSite }),
    });
    const mine = await (
      await t.fetch("/pass-on-logs", { method: "GET", headers: auth(w.tokens.alphaPortal) })
    ).json();
    expect(mine.every((log: any) => log.title !== "Bravo only")).toBe(true);
  });

  test("a placeless pass-on stays inside the tenant that wrote it", async () => {
    // This is the old leak: no site, no sub-location, so the previous rule
    // handed it to every guard in the system.
    await t.run(async (ctx) => {
      await ctx.db.insert("passOnLogs", {
        clientId: w.alphaClient,
        title: "Alpha internal",
        instruction: "Alpha guards only",
        priority: "normal",
        siteLabel: "",
        requiresAcknowledgement: false,
        createdBy: w.admin,
        active: true,
        createdAt: Date.now(),
      });
    });
    const bravoSees = await (
      await t.fetch("/pass-on-logs", { method: "GET", headers: auth(w.tokens.bravoGuard) })
    ).json();
    expect(bravoSees.every((log: any) => log.title !== "Alpha internal")).toBe(true);

    const alphaSees = await (
      await t.fetch("/pass-on-logs", { method: "GET", headers: auth(w.tokens.alphaGuard) })
    ).json();
    expect(alphaSees.some((log: any) => log.title === "Alpha internal")).toBe(true);
  });

  test("a named recipient gets it and the guard beside them does not", async () => {
    await t.fetch("/pass-on-logs", {
      method: "POST",
      headers: auth(w.tokens.alphaPortal),
      body: passOn({ title: "For Ade only", siteId: w.alphaSite, recipientUserIds: [w.alphaGuard] }),
    });
    const ade = await (
      await t.fetch("/pass-on-logs", { method: "GET", headers: auth(w.tokens.alphaGuard) })
    ).json();
    const bola = await (
      await t.fetch("/pass-on-logs", { method: "GET", headers: auth(w.tokens.alphaRelief) })
    ).json();
    expect(ade.some((log: any) => log.title === "For Ade only")).toBe(true);
    expect(bola.every((log: any) => log.title !== "For Ade only")).toBe(true);
  });

  test("the guard sees who sent it, from where, and when", async () => {
    await t.fetch("/pass-on-logs", {
      method: "POST",
      headers: auth(w.tokens.alphaPortal),
      body: passOn({ title: "Context check", siteId: w.alphaSite }),
    });
    const logs = await (
      await t.fetch("/pass-on-logs", { method: "GET", headers: auth(w.tokens.alphaGuard) })
    ).json();
    const log = logs.find((l: any) => l.title === "Context check");
    expect(log.createdByName).toBe("Alpha Portal");
    expect(log.createdByRole).toBe("main_account");
    expect(log.siteName).toBe("Alpha Ikeja Warehouse");
    expect(log.clientName).toBe("Alpha Retail Group");
    expect(Date.parse(log.createdAt)).toBeGreaterThan(0);
  });

  test("the addressable roster only ever lists this client's own guards", async () => {
    const roster = await (
      await t.fetch("/client/addressable-guards", { method: "GET", headers: auth(w.tokens.alphaPortal) })
    ).json();
    const names = roster.map((g: any) => g.name);
    expect(names).toContain("Ade Guard");
    expect(names).not.toContain("Chidi Guard");
  });

  test("a guard cannot read the addressable roster at all", async () => {
    const res = await t.fetch("/client/addressable-guards", {
      method: "GET",
      headers: auth(w.tokens.alphaGuard),
    });
    expect([401, 403]).toContain(res.status);
  });
});

/**
 * Guard observations.
 *
 * Lightweight by design, which is exactly why the scoping has to be tight:
 * anything this cheap to file will be filed often, and a note tagged with a
 * site belongs only to the company that owns that site.
 */
describe("guard observations", () => {
  const note = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ message: "Rear gate light is not working", ...extra });

  test("a guard can file one against their own site", async () => {
    const res = await t.fetch("/observations", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: note({ siteId: w.alphaSite }),
    });
    expect(res.status).toBe(201);
    const rows = await t.run((ctx) => ctx.db.query("observations").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].clientId).toBe(w.alphaClient);
  });

  test("a guard cannot file one against a site they are not posted to", async () => {
    const res = await t.fetch("/observations", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: note({ siteId: w.bravoSite }),
    });
    expect(res.status).toBe(400);
    const rows = await t.run((ctx) => ctx.db.query("observations").collect());
    expect(rows).toHaveLength(0);
  });

  test("an empty message is refused", async () => {
    const res = await t.fetch("/observations", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: JSON.stringify({ message: "   ", siteId: w.alphaSite }),
    });
    expect(res.status).toBe(400);
  });

  test("staff see it, and a guard sees only their own", async () => {
    await t.fetch("/observations", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: note({ siteId: w.alphaSite }),
    });
    const adminSees = await (
      await t.fetch("/observations", { method: "GET", headers: auth(w.tokens.admin) })
    ).json();
    expect(adminSees).toHaveLength(1);
    expect(adminSees[0].officerName).toBe("Ade Guard");

    const otherGuard = await (
      await t.fetch("/observations", { method: "GET", headers: auth(w.tokens.alphaRelief) })
    ).json();
    expect(otherGuard).toHaveLength(0);
  });

  test("a client sees its own notes but never which guard wrote them", async () => {
    await t.fetch("/observations", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: note({ siteId: w.alphaSite }),
    });
    await t.fetch("/observations", {
      method: "POST",
      headers: auth(w.tokens.bravoGuard),
      body: JSON.stringify({ message: "Bravo note", siteId: w.bravoSite }),
    });
    const portalSees = await (
      await t.fetch("/observations", { method: "GET", headers: auth(w.tokens.alphaPortal) })
    ).json();
    expect(portalSees).toHaveLength(1);
    expect(portalSees[0].message).toMatch(/Rear gate light/);
    // The standing rule: a client is shown activity, never identities.
    expect(portalSees[0].officerName).toBeNull();
  });

  test("acknowledging clears it from the working list", async () => {
    await t.fetch("/observations", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: note({ siteId: w.alphaSite }),
    });
    const [row] = await t.run((ctx) => ctx.db.query("observations").collect());
    const ack = await t.fetch(`/observations/${row._id}/acknowledge`, {
      method: "POST",
      headers: auth(w.tokens.admin),
    });
    expect(ack.status).toBe(200);
    const open = await (
      await t.fetch("/observations", { method: "GET", headers: auth(w.tokens.admin) })
    ).json();
    expect(open).toHaveLength(0);
    const all = await (
      await t.fetch("/observations?includeAcknowledged=true", {
        method: "GET",
        headers: auth(w.tokens.admin),
      })
    ).json();
    expect(all).toHaveLength(1);
    expect(all[0].acknowledgedByName).toBe("Ada Admin");
  });

  test("a guard cannot acknowledge one", async () => {
    await t.fetch("/observations", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: note({ siteId: w.alphaSite }),
    });
    const [row] = await t.run((ctx) => ctx.db.query("observations").collect());
    const res = await t.fetch(`/observations/${row._id}/acknowledge`, {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
    });
    expect(res.status).toBe(403);
  });
});

/**
 * Emergency alerts, both directions.
 *
 * A guard's panic press travels up to the control room and out to the client
 * who owns the site. A client's alarm travels out to the guards posted there
 * and up to the control room. Neither may cross into another tenant.
 */
describe("emergency alerts", () => {
  const raise = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ note: "Break-in at the rear gate", ...extra });

  test("a guard's alert reaches staff with everything needed to act", async () => {
    await t.fetch("/emergency/trigger", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: raise({ checkpointId: w.alphaCheckpoint, siteLabel: "Alpha Ikeja Warehouse" }),
    });
    const active = await (
      await t.fetch("/emergency/active", { method: "GET", headers: auth(w.tokens.admin) })
    ).json();
    expect(active).toHaveLength(1);
    const sos = active[0];
    expect(sos.source).toBe("guard");
    expect(sos.officerName).toBe("Ade Guard");
    // The number to ring. Its absence was the gap: an alert with no way to
    // call the person who raised it.
    expect(sos.officerPhone).toBe("+2348000000000");
    expect(sos.clientName).toBe("Alpha Retail Group");
    expect(sos.siteName).toBe("Alpha Ikeja Warehouse");
    expect(sos.reason).toMatch(/rear gate/i);
    expect(Date.parse(sos.triggeredAt)).toBeGreaterThan(0);
  });

  test("the owning client sees it and another client does not", async () => {
    await t.fetch("/emergency/trigger", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: raise({ checkpointId: w.alphaCheckpoint }),
    });
    const alphaSees = await (
      await t.fetch("/client/emergency/active", { method: "GET", headers: auth(w.tokens.alphaPortal) })
    ).json();
    expect(alphaSees).toHaveLength(1);

    // Bravo's guard raises nothing; Alpha's portal must still see only its own.
    await t.fetch("/emergency/trigger", {
      method: "POST",
      headers: auth(w.tokens.bravoGuard),
      body: raise({ checkpointId: w.bravoCheckpoint }),
    });
    const alphaAgain = await (
      await t.fetch("/client/emergency/active", { method: "GET", headers: auth(w.tokens.alphaPortal) })
    ).json();
    expect(alphaAgain).toHaveLength(1);
    expect(alphaAgain[0].clientId).toBe(w.alphaClient);
  });

  test("a client can raise one on its own site", async () => {
    const res = await t.fetch("/client/emergency/trigger", {
      method: "POST",
      headers: auth(w.tokens.alphaPortal),
      body: raise({ siteId: w.alphaSite }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.source).toBe("client");
  });

  test("a client cannot raise one on another company's site", async () => {
    const res = await t.fetch("/client/emergency/trigger", {
      method: "POST",
      headers: auth(w.tokens.alphaPortal),
      body: raise({ siteId: w.bravoSite }),
    });
    expect(res.status).toBe(400);
    const rows = await t.run((ctx) => ctx.db.query("emergencyEvents").collect());
    expect(rows).toHaveLength(0);
  });

  test("a client-raised alarm reaches the guards posted there, and nobody else", async () => {
    await t.fetch("/client/emergency/trigger", {
      method: "POST",
      headers: auth(w.tokens.alphaPortal),
      body: raise({ siteId: w.alphaSite }),
    });
    const alphaGuardSees = await (
      await t.fetch("/emergency/mine", { method: "GET", headers: auth(w.tokens.alphaGuard) })
    ).json();
    expect(alphaGuardSees).toHaveLength(1);
    expect(alphaGuardSees[0].source).toBe("client");

    const bravoGuardSees = await (
      await t.fetch("/emergency/mine", { method: "GET", headers: auth(w.tokens.bravoGuard) })
    ).json();
    expect(bravoGuardSees).toHaveLength(0);
  });

  test("resolving one clears it from every live list", async () => {
    await t.fetch("/emergency/trigger", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: raise({ checkpointId: w.alphaCheckpoint }),
    });
    const [row] = await t.run((ctx) => ctx.db.query("emergencyEvents").collect());
    const res = await t.fetch(`/emergency/${row._id}/resolve`, {
      method: "POST",
      headers: auth(w.tokens.admin),
    });
    expect(res.status).toBe(200);
    const staffSees = await (
      await t.fetch("/emergency/active", { method: "GET", headers: auth(w.tokens.admin) })
    ).json();
    expect(staffSees).toHaveLength(0);
    const clientSees = await (
      await t.fetch("/client/emergency/active", { method: "GET", headers: auth(w.tokens.alphaPortal) })
    ).json();
    expect(clientSees).toHaveLength(0);
  });

  test("a guard cannot resolve an emergency", async () => {
    await t.fetch("/emergency/trigger", {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
      body: raise({ checkpointId: w.alphaCheckpoint }),
    });
    const [row] = await t.run((ctx) => ctx.db.query("emergencyEvents").collect());
    const res = await t.fetch(`/emergency/${row._id}/resolve`, {
      method: "POST",
      headers: auth(w.tokens.alphaGuard),
    });
    expect(res.status).toBe(403);
  });
});
