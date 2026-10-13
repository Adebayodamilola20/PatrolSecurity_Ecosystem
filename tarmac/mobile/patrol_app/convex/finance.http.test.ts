/// <reference types="vite/client" />
/**
 * The finance API as the admin site calls it: admin only, plain-language
 * errors, and records that land in the database.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { signPatrolToken } from "./lib/jwt";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");
let t: ReturnType<typeof convexTest>;
let adminToken: string;
let guardToken: string;

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const post = (path: string, body: unknown, token = adminToken) =>
  t.fetch(`/finance/${path}`, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
const get = (path: string, token = adminToken) => t.fetch(`/finance/${path}`, { method: "GET", headers: headers(token) });

beforeEach(async () => {
  t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const base = { passwordHash: "x", phone: "", active: true, liveTracking: false, createdAt: Date.now() };
    const admin = await ctx.db.insert("users", { ...base, name: "Admin", email: "admin@tarmac.test", role: "admin" });
    const guard = await ctx.db.insert("users", { ...base, name: "Guard", email: "guard@tarmac.test", role: "guard" });
    return { admin, guard };
  });
  adminToken = await signPatrolToken({ userId: ids.admin as Id<"users">, email: "admin@tarmac.test", role: "admin" });
  guardToken = await signPatrolToken({ userId: ids.guard as Id<"users">, email: "guard@tarmac.test", role: "guard" });
});

describe("finance API", () => {
  test("refuses anyone who is not an admin", async () => {
    expect((await t.fetch("/finance/overview", { method: "GET" })).status).toBe(401);
    expect((await get("overview", guardToken)).status).toBe(403);
    expect((await post("branches/add-tarmac", {}, guardToken)).status).toBe(403);
    expect(await t.run(async (ctx) => (await ctx.db.query("finBranches").collect()).length)).toBe(0);
  });

  test("full flow: branches → client → invoice → payment, all saved", async () => {
    expect((await post("branches/add-tarmac", {})).status).toBe(200);
    const branches = await (await get("branches")).json();
    expect(branches).toHaveLength(7);
    const jos = branches[0];

    const clientRes = await post("clients/create", { name: "Rayfield Estate", branchId: jos.id, monthlyFeeKobo: 100_000_000, guards: 24 });
    expect(clientRes.status).toBe(200);
    const clientId = await clientRes.json();

    const inv = await (await post("invoices/create", { clientId, period: "2026-10" })).json();
    expect(inv.number).toBe("TSL-2026-0001");
    expect((await post("invoices/send", { invoiceId: inv.id })).status).toBe(200);

    expect((await post("payments/record", { clientId, amountKobo: 107_500_000, receivedAt: Date.now() - 1000, method: "Bank transfer" })).status).toBe(200);
    const invoice = await (await get(`invoices/get?id=${inv.id}`)).json();
    expect(invoice.status).toBe("paid");

    const overview = await (await get("overview")).json();
    expect(overview.receivedKobo).toBe(107_500_000);
    expect(overview.owedKobo).toBe(0);
  });

  test("mistakes come back as plain sentences", async () => {
    await post("branches/add-tarmac", {});
    const [jos] = await (await get("branches")).json();
    const res = await post("partners/create", {
      branchId: jos.id,
      name: "Ibrahim",
      phone: "0803",
      bankName: "Zenith",
      accountNumber: "123",
      accountName: "Ibrahim",
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("Account number must be 10 digits");

    const missing = await post("clients/create", { name: "No Branch" });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(await missing.json())).toContain("missing or not in the right format");
  });

  test("stray fields never reach the database", async () => {
    await post("branches/add-tarmac", {});
    const [jos] = await (await get("branches")).json();
    const res = await post("clients/create", { name: "X", branchId: jos.id, monthlyFeeKobo: 0, guards: 0, status: "ended", payAccountNumber: "9999999999" });
    expect(res.status).toBe(200);
    const [client] = await t.run(async (ctx) => await ctx.db.query("finClients").collect());
    expect(client.status).toBe("active");
    expect(client.payAccountNumber).toBeUndefined();
  });
});
