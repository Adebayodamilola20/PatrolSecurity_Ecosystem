/// <reference types="vite/client" />
/**
 * Monnify notifications: only genuine, confirmed payments are recorded, and
 * each one exactly once. Monnify itself is faked — nothing leaves the test.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { monnifySignature, parsePaidOn } from "./finance/monnify";

const modules = import.meta.glob("./**/*.*s");
const SECRET = "test-monnify-secret";
let t: ReturnType<typeof convexTest>;
let clientId: Id<"finClients">;
let confirmed: { paid: boolean; amount: number };

function fakeMonnify() {
  vi.stubGlobal("fetch", async (url: string) => {
    if (String(url).endsWith("/api/v1/auth/login")) {
      return Response.json({ requestSuccessful: true, responseBody: { accessToken: "tok" } });
    }
    if (String(url).includes("/api/v2/transactions/")) {
      return Response.json({
        requestSuccessful: true,
        responseBody: { paymentStatus: confirmed.paid ? "PAID" : "PENDING", amountPaid: confirmed.amount },
      });
    }
    return new Response("not found", { status: 404 });
  });
}

function event(amountPaid: number, reference = "MNFY|20261013|000123", accountRef: string = clientId) {
  return JSON.stringify({
    eventType: "SUCCESSFUL_TRANSACTION",
    eventData: {
      transactionReference: reference,
      amountPaid,
      paidOn: "2026-10-13 10:57:53.474",
      product: { type: "RESERVED_ACCOUNT", reference: accountRef },
    },
  });
}

async function send(body: string, signature?: string) {
  return await t.fetch("/finance/monnify/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "monnify-signature": signature ?? (await monnifySignature(SECRET, body)) },
    body,
  });
}

const payments = () => t.run(async (ctx) => await ctx.db.query("finPayments").collect());

beforeEach(async () => {
  process.env.MONNIFY_API_KEY = "MK_TEST";
  process.env.MONNIFY_SECRET_KEY = SECRET;
  process.env.MONNIFY_CONTRACT_CODE = "1234567890";
  confirmed = { paid: true, amount: 1_075_000 };
  fakeMonnify();
  t = convexTest(schema, modules);
  const admin = await t.run(async (ctx) =>
    ctx.db.insert("users", { name: "A", email: "a@t.test", passwordHash: "x", role: "admin", phone: "", active: true, liveTracking: false, createdAt: Date.now() }),
  );
  await t.mutation(internal.finance.branches.create, { actorId: admin, name: "Jos", isHq: true });
  const [jos] = await t.query(internal.finance.branches.list, {});
  clientId = await t.mutation(internal.finance.clients.create, { actorId: admin, name: "Rayfield Estate", branchId: jos.id, monthlyFeeKobo: 100_000_000, guards: 10 });
  await t.mutation(internal.finance.clients.setPayAccount, {
    actorId: admin,
    clientId,
    bankName: "Moniepoint MFB",
    accountNumber: "6012448901",
    accountRef: clientId,
    provider: "monnify",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MONNIFY_API_KEY;
  delete process.env.MONNIFY_SECRET_KEY;
  delete process.env.MONNIFY_CONTRACT_CODE;
});

describe("Monnify notifications", () => {
  test("a genuine payment is recorded once and split", async () => {
    const body = event(1_075_000);
    expect((await send(body)).status).toBe(200);
    expect((await send(body)).status).toBe(200); // Monnify retries — still one payment
    const rows = await payments();
    expect(rows).toHaveLength(1);
    expect(rows[0].amountKobo).toBe(107_500_000);
    expect(rows[0].source).toBe("monnify");
    expect(rows[0].split.hq + rows[0].split.vat + rows[0].split.partner + rows[0].split.salary).toBe(107_500_000);
  });

  test("a forged signature is refused", async () => {
    const res = await send(event(1_075_000), "deadbeef");
    expect(res.status).toBe(401);
    expect(await payments()).toHaveLength(0);
  });

  test("a payment Monnify does not confirm is refused", async () => {
    confirmed = { paid: false, amount: 1_075_000 };
    expect((await send(event(1_075_000))).status).toBe(400);
    confirmed = { paid: true, amount: 5 };
    expect((await send(event(1_075_000))).status).toBe(400);
    expect(await payments()).toHaveLength(0);
  });

  test("money for an unknown account is logged, not lost silently", async () => {
    confirmed = { paid: true, amount: 1_000 };
    const res = await send(event(1_000, "MNFY|X", "unknown-ref"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("unmatched");
    const logs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(logs.some((l) => l.action === "finance.payment.unmatched")).toBe(true);
  });

  test("switched off without keys", async () => {
    delete process.env.MONNIFY_SECRET_KEY;
    expect((await send(event(1_075_000))).status).toBe(503);
  });

  test("Monnify's Nigerian-time timestamps are read correctly", () => {
    expect(new Date(parsePaidOn("2026-10-13 10:57:53.474")).toISOString()).toBe("2026-10-13T09:57:53.000Z");
  });
});
