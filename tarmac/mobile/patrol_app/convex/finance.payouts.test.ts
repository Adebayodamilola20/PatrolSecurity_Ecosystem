/// <reference types="vite/client" />
/**
 * Money out, bank checks, release on a date, the daily money check and staff
 * photos. Monnify is faked — nothing leaves the test.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { signPatrolToken } from "./lib/jwt";

const modules = import.meta.glob("./**/*.*s");
const SPLIT = { hq: 800, vat: 750, partner: 3450, salary: 5000 };
const f = internal.finance;

let t: ReturnType<typeof convexTest>;
let balanceKobo = 123_456_750;
let admin: Id<"users">;
let token: string;
let jos: Id<"finBranches">;
let abuja: Id<"finBranches">;

/** What the fake Monnify knows and how it answers. */
let fake: {
  accounts: Record<string, string>; // "057:2081234541" → name
  transfer: (body: any) => { status: number; json: any };
  summary: Record<string, string>; // reference → status
  accountTxns: Record<string, any[]>;
  paid: Record<string, number>; // transactionReference → amount
  transfers: any[];
};

const ok = (responseBody: unknown) => ({ status: 200, json: { requestSuccessful: true, responseMessage: "success", responseBody } });

function fakeMonnify() {
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    const p = url.pathname;
    let r: { status: number; json: any } = { status: 404, json: { requestSuccessful: false, responseMessage: "not found" } };
    if (p === "/api/v1/auth/login") r = ok({ accessToken: "tok" });
    else if (p === "/api/v1/banks") r = ok([{ code: "057", name: "Zenith bank" }, { code: "058", name: "GTBank" }, { code: "232", name: "Sterling bank" }]);
    else if (p === "/api/v2/disbursements/account/validate") {
      const key = `${url.searchParams.get("bankCode")}:${url.searchParams.get("accountNumber")}`;
      r = fake.accounts[key]
        ? ok({ accountNumber: url.searchParams.get("accountNumber"), accountName: fake.accounts[key], bankCode: url.searchParams.get("bankCode") })
        : { status: 400, json: { requestSuccessful: false, responseMessage: "Invalid account details supplied" } };
    } else if (p === "/api/v2/disbursements/single") {
      const body = JSON.parse(String(init?.body));
      fake.transfers.push(body);
      r = fake.transfer(body);
    } else if (p === "/api/v2/disbursements/single/summary") {
      const status = fake.summary[url.searchParams.get("reference") ?? ""];
      r = status ? ok({ status, totalFee: 10 }) : { status: 400, json: { requestSuccessful: false, responseMessage: "Transfer not found" } };
    } else if (p === "/api/v2/disbursements/single/validate-otp") {
      const body = JSON.parse(String(init?.body));
      r = body.authorizationCode === "123456" ? ok({ status: "SUCCESS", totalFee: 10 }) : { status: 400, json: { requestSuccessful: false, responseMessage: "Invalid OTP" } };
    } else if (p === "/api/v2/disbursements/wallet-balance") {
      r = url.searchParams.get("accountNumber") === "8000000001"
        ? ok({ availableBalance: balanceKobo / 100, ledgerBalance: 1_300_000 })
        : { status: 400, json: { requestSuccessful: false, responseMessage: "Supplied account number does not belong to merchant" } };
    } else if (p === "/api/v1/bank-transfer/reserved-accounts/transactions") {
      r = ok({ content: fake.accountTxns[url.searchParams.get("accountReference") ?? ""] ?? [] });
    } else if (p.startsWith("/api/v2/transactions/")) {
      const ref = decodeURIComponent(p.slice("/api/v2/transactions/".length));
      r = ok({ paymentStatus: fake.paid[ref] ? "PAID" : "PENDING", amountPaid: fake.paid[ref] ?? 0 });
    }
    return Response.json(r.json, { status: r.status });
  });
}

const post = (path: string, body: unknown) =>
  t.fetch(`/finance/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (path: string) => t.fetch(`/finance/${path}`, { headers: { Authorization: `Bearer ${token}` } });

const payouts = () => t.run(async (ctx) => await ctx.db.query("finPayouts").collect());

async function addClient(branchId: Id<"finBranches">, ref = "client-ref-1") {
  const clientId = await t.mutation(f.clients.create, { actorId: admin, name: "Rayfield Estate", branchId, monthlyFeeKobo: 100_000_000, guards: 10 });
  await t.mutation(f.clients.setPayAccount, {
    actorId: admin,
    clientId,
    bankName: "Sterling bank",
    accountNumber: "2201361040",
    accountRef: ref,
    provider: "monnify",
  });
  return clientId;
}

/** ₦1,075,000 arriving through Monnify. */
const monnifyPayment = (reference = "MNFY|1", ref = "client-ref-1") =>
  t.mutation(f.monnify.recordWebhookPayment, { accountRef: ref, reference, amountKobo: 107_500_000, receivedAt: Date.now() - 1000 });

async function setUpAccounts() {
  expect((await post("settings/account", { which: "hq", bankCode: "058", accountNumber: "0001112223" })).status).toBe(200);
  expect((await post("branches/update", { branchId: abuja, bankCode: "057", accountNumber: "1012345678" })).status).toBe(200);
  const res = await post("partners/create", { branchId: abuja, name: "Ibrahim Danladi", phone: "0803", bankCode: "057", accountNumber: "2081234541" });
  expect(res.status).toBe(200);
  await t.mutation(f.branches.approvePartner, { actorId: admin, partnerId: await res.json() });
  process.env.MONNIFY_WALLET_ACCOUNT = "8000000001";
}

beforeEach(async () => {
  process.env.PATROL_JWT_SECRET = process.env.PATROL_JWT_SECRET ?? "test-secret-test-secret-test-secret-32";
  process.env.MONNIFY_API_KEY = "MK_TEST";
  process.env.MONNIFY_SECRET_KEY = "secret";
  process.env.MONNIFY_CONTRACT_CODE = "1234567890";
  fake = {
    accounts: {
      "058:0001112223": "TARMAC SECURITY LIMITED",
      "057:1012345678": "TARMAC SECURITY ABUJA SALARY",
      "057:2081234541": "IBRAHIM DANLADI",
    },
    transfer: () => ok({ status: "SUCCESS", totalFee: 10 }),
    summary: {},
    accountTxns: {},
    paid: {},
    transfers: [],
  };
  balanceKobo = 123_456_750;
  fakeMonnify();
  t = convexTest(schema, modules);
  admin = await t.run(async (ctx) =>
    ctx.db.insert("users", { name: "A", email: "a@tarmac.test", passwordHash: "x", role: "admin", phone: "", active: true, liveTracking: false, createdAt: Date.now() }),
  );
  token = await signPatrolToken({ userId: admin, email: "a@tarmac.test", role: "admin" });
  jos = await t.mutation(f.branches.create, { actorId: admin, name: "Jos", isHq: true });
  abuja = await t.mutation(f.branches.create, { actorId: admin, name: "Abuja" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MONNIFY_API_KEY;
  delete process.env.MONNIFY_SECRET_KEY;
  delete process.env.MONNIFY_CONTRACT_CODE;
  delete process.env.MONNIFY_WALLET_ACCOUNT;
});

describe("bank account check", () => {
  test("saves the name the bank gives, not what was typed", async () => {
    const res = await post("partners/create", {
      branchId: abuja, name: "Ibrahim", phone: "0803", bankCode: "057", accountNumber: "2081234541", accountName: "Somebody Else",
    });
    expect(res.status).toBe(200);
    const [p] = await t.query(f.branches.listPartners, {});
    expect(p.accountName).toBe("IBRAHIM DANLADI");
    expect(p.bankName).toBe("Zenith bank");
  });

  test("a wrong number says 'Account not found' and saves nothing", async () => {
    const res = await post("partners/create", { branchId: abuja, name: "Ibrahim", phone: "0803", bankCode: "057", accountNumber: "9999999999" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("Account not found");
    expect(await t.query(f.branches.listPartners, {})).toHaveLength(0);
  });

  test("the check can be run on its own before saving", async () => {
    const res = await post("banks/check", { bankCode: "058", accountNumber: "0001112223" });
    expect(await res.json()).toMatchObject({ accountName: "TARMAC SECURITY LIMITED", bankName: "GTBank" });
    const banks = await (await get("banks")).json();
    expect(banks.map((b: any) => b.name)).toEqual(["GTBank", "Sterling bank", "Zenith bank"]);
  });

  test("a bank not on the list is refused", async () => {
    const res = await post("banks/check", { bankCode: "999", accountNumber: "0001112223" });
    expect(JSON.stringify(await res.json())).toContain("Choose the bank from the list");
  });
});

describe("payouts", () => {
  test("Head Office's share and VAT stay in the pot; branch shares wait for accounts, then fill in", async () => {
    await addClient(abuja);
    await monnifyPayment();
    let rows = await payouts();
    expect(rows.map((r) => [r.share, r.amountKobo, r.status])).toEqual([
      ["partner", 37_087_500, "waiting"],
      ["salary", 53_750_000, "waiting"],
    ]);
    await setUpAccounts();
    rows = await payouts();
    expect(rows.every((r) => r.status === "ready")).toBe(true);
    expect(rows.find((r) => r.share === "partner")!.accountName).toBe("IBRAHIM DANLADI");
    expect(rows.find((r) => r.share === "salary")!.accountName).toBe("TARMAC SECURITY ABUJA SALARY");
  });

  test("with separate accounts set, Head Office's share and VAT are sent there too", async () => {
    await setUpAccounts(); // includes a Head Office account
    fake.accounts["058:0009998887"] = "TARMAC VAT ACCOUNT";
    expect((await post("settings/account", { which: "vat", bankCode: "058", accountNumber: "0009998887" })).status).toBe(200);
    await addClient(abuja);
    await monnifyPayment();
    const rows = await payouts();
    expect(rows.map((r) => [r.share, r.amountKobo])).toEqual([
      ["hq", 8_600_000],
      ["vat", 8_062_500],
      ["partner", 37_087_500],
      ["salary", 53_750_000],
    ]);
    expect(rows.find((r) => r.share === "vat")!.accountName).toBe("TARMAC VAT ACCOUNT");
    // Removing the VAT account: future VAT stays in the pot again.
    expect((await post("settings/account", { which: "vat", remove: true })).status).toBe(200);
  });

  test("payments typed in by hand are never sent from Monnify", async () => {
    const clientId = await addClient(abuja);
    await t.mutation(f.payments.record, { actorId: admin, clientId, amountKobo: 107_500_000, receivedAt: Date.now() - 1000 });
    expect(await payouts()).toHaveLength(0);
  });

  test("Send now pays each payout exactly once, with the bank's account name", async () => {
    await setUpAccounts();
    await addClient(abuja);
    await monnifyPayment();
    const res = await post("payouts/send-now", {});
    expect(await res.json()).toMatchObject({ sent: 3, failed: 0 }); // Head Office, partner, salaries; VAT stays
    expect(fake.transfers).toHaveLength(3);
    const partnerTransfer = fake.transfers.find((x) => x.destinationAccountNumber === "2081234541");
    expect(partnerTransfer).toMatchObject({ amount: 370_875, destinationAccountName: "IBRAHIM DANLADI", destinationBankCode: "057", sourceAccountNumber: "8000000001" });
    expect((await payouts()).every((r) => r.status === "sent")).toBe(true);
    await post("payouts/send-now", {});
    expect(fake.transfers).toHaveLength(3);
    expect(new Set(fake.transfers.map((x) => x.reference)).size).toBe(3);
  });

  test("automatic sending is off by default; nothing goes out on its own", async () => {
    await setUpAccounts();
    await addClient(abuja);
    await monnifyPayment();
    await t.action(f.payouts.tick, {});
    expect(fake.transfers).toHaveLength(0);
    expect((await post("settings/auto-send", { autoSend: true })).status).toBe(200);
    await t.action(f.payouts.tick, {});
    expect(fake.transfers).toHaveLength(3);
  });

  test("an unclear answer is asked about, never blindly re-sent with a new reference", async () => {
    await setUpAccounts();
    await addClient(abuja);
    await monnifyPayment();
    fake.transfer = () => ({ status: 502, json: null });
    await post("payouts/send-now", {});
    let rows = await payouts();
    expect(rows.every((r) => r.status === "sending")).toBe(true);
    // Monnify did pay one of them; the others it never received.
    const paidRef = rows[0].reference!;
    fake.summary[paidRef] = "SUCCESS";
    await t.action(f.payouts.recheckSending, {});
    rows = await payouts();
    expect(rows.find((r) => r.reference === paidRef)!.status).toBe("sent");
    expect(rows.filter((r) => r.status === "ready")).toHaveLength(2);
    fake.transfer = () => ok({ status: "SUCCESS" });
    const before = fake.transfers.length;
    await post("payouts/send-now", {});
    const resent = fake.transfers.slice(before).map((x) => x.reference);
    expect(resent).toHaveLength(2);
    expect(resent).not.toContain(paidRef);
    // Same references as the first try: Monnify would refuse a double payment.
    expect(resent.every((r: string) => fake.transfers.slice(0, before).some((x) => x.reference === r))).toBe(true);
  });

  test("a failed payout can be tried again with a new reference", async () => {
    await setUpAccounts();
    await addClient(abuja);
    await monnifyPayment();
    fake.transfer = () => ({ status: 400, json: { requestSuccessful: false, responseMessage: "Insufficient balance" } });
    await post("payouts/send-now", {});
    let rows = await payouts();
    expect(rows.every((r) => r.status === "failed" && r.error === "Insufficient balance")).toBe(true);
    const oldRef = rows[0].reference;
    expect((await post("payouts/retry", { payoutId: rows[0]._id })).status).toBe(200);
    fake.transfer = () => ok({ status: "SUCCESS" });
    await post("payouts/send-now", {});
    rows = await payouts();
    expect(rows[0].status).toBe("sent");
    expect(rows[0].reference).not.toBe(oldRef);
    expect(rows[0].attempts).toBe(2);
  });

  test("when Monnify asks for the email code, the admin types it", async () => {
    await setUpAccounts();
    await addClient(abuja);
    await monnifyPayment();
    fake.transfer = () => ok({ status: "PENDING_AUTHORIZATION" });
    await post("payouts/send-now", {});
    const [first] = await payouts();
    expect(first.status).toBe("needs_code");
    const wrong = await post("payouts/code", { payoutId: first._id, code: "000000" });
    expect(JSON.stringify(await wrong.json())).toContain("Invalid OTP");
    expect((await post("payouts/code", { payoutId: first._id, code: "123456" })).status).toBe(200);
    expect((await payouts())[0].status).toBe("sent");
  });

  test("a share waiting for a replaced partner goes to the new approved partner", async () => {
    await addClient(abuja);
    const first = await post("partners/create", { branchId: abuja, name: "Ibrahim Danladi", phone: "0803", bankCode: "057", accountNumber: "2081234541" });
    await t.mutation(f.branches.approvePartner, { actorId: admin, partnerId: await first.json() });
    // Ibrahim's account is closed before his share is sent; a new partner takes over.
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("finPartners").collect())[0];
      await ctx.db.patch(p._id, { bankCode: undefined });
    });
    await monnifyPayment();
    expect((await payouts()).find((r) => r.share === "partner")!.waitingFor).toMatch(/checked again/);
    fake.accounts["058:0001112223"] = "AMINA YUSUF";
    const second = await post("partners/create", { branchId: abuja, name: "Amina Yusuf", phone: "0805", bankCode: "058", accountNumber: "0001112223" });
    await t.mutation(f.branches.approvePartner, { actorId: admin, partnerId: await second.json() });
    const partnerPayout = (await payouts()).find((r) => r.share === "partner")!;
    expect(partnerPayout.status).toBe("ready");
    expect(partnerPayout.accountName).toBe("AMINA YUSUF");
  });

  test("Head Office has no partner, so its partner share stays in the pot", async () => {
    await setUpAccounts();
    await addClient(jos, "jos-ref");
    await monnifyPayment("MNFY|J", "jos-ref");
    const rows = await payouts();
    expect(rows.find((r) => r.share === "partner")).toBeUndefined();
    expect(rows.find((r) => r.share === "salary")!.status).toBe("waiting"); // Jos has no salary account yet
  });
});

describe("Head Office account checks", () => {
  test("only what the Head Office account can cover is sent; the rest waits", async () => {
    await setUpAccounts();
    await addClient(abuja);
    await monnifyPayment();
    balanceKobo = 40_000_000; // ₦400,000: enough for Head Office (₦86,000) and the partner (₦370,875)? No — one at a time
    const res = await (await post("payouts/send-now", {})).json();
    expect(res.reason).toMatch(/Not enough money/);
    const rows = await payouts();
    expect(rows.filter((r) => r.status === "sent").reduce((s, r) => s + r.amountKobo, 0)).toBeLessThanOrEqual(40_000_000);
    expect(rows.some((r) => r.status === "ready")).toBe(true);
  });

  test("a branch can be added with its bank account in one go", async () => {
    const res = await post("branches/create", { name: "Kano", splitBps: SPLIT, bankCode: "057", accountNumber: "1012345678" });
    expect(res.status).toBe(200);
    const kano = (await t.query(f.branches.list, {})).find((b) => b.name === "Kano")!;
    expect(kano.salaryAccountName).toBe("TARMAC SECURITY ABUJA SALARY");
  });
});

describe("Head Office balance", () => {
  test("is read from the Monnify wallet once it is set up", async () => {
    expect(await (await get("balance")).json()).toMatchObject({ available: false, reason: expect.stringContaining("not set up yet") });
    process.env.MONNIFY_WALLET_ACCOUNT = "8000000001";
    expect(await (await get("balance")).json()).toMatchObject({ available: true, availableKobo: 123_456_750, ledgerKobo: 130_000_000 });
  });
});

describe("sending day and VAT switch", () => {
  test("each branch has its own pay day; Send now still pays at once", async () => {
    await setUpAccounts();
    await addClient(abuja);
    await monnifyPayment();
    await post("settings/auto-send", { autoSend: true });
    const today = Number(new Date(Date.now() + 3600_000).toISOString().slice(8, 10));
    const other = today >= 28 ? 1 : today + 1;
    expect((await post("branches/pay-day", { branchId: abuja, payDay: other })).status).toBe(200);
    fake.transfers = [];
    await t.action(f.payouts.tick, {});
    // Every share of Abuja's payment waits for Abuja's day.
    expect(fake.transfers).toHaveLength(0);
    expect((await post("branches/pay-day", { branchId: abuja, payDay: today > 28 ? null : today })).status).toBe(200);
    await t.action(f.payouts.tick, {});
    expect(fake.transfers.length).toBeGreaterThan(0);
    expect(JSON.stringify(await (await post("branches/pay-day", { branchId: abuja, payDay: 31 })).json())).toContain("1 to 28");
  });

  test("with VAT switched off, new invoices have no VAT", async () => {
    const clientId = await addClient(abuja);
    await post("settings/vat", { on: false });
    const inv = await t.mutation(f.invoices.create, { actorId: admin, clientId, period: "2026-10" });
    const saved = await t.run(async (ctx) => ctx.db.get(inv.id as any));
    expect(saved).toMatchObject({ subtotalKobo: 100_000_000, vatKobo: 0, totalKobo: 100_000_000 });
  });
});

describe("release on a set date", () => {
  test("held money is shared and sent on its date, not before", async () => {
    await setUpAccounts();
    await addClient(abuja);
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString().slice(0, 10);
    expect((await post("branches/hold", { branchId: abuja, onHold: true, releaseOn: tomorrow })).status).toBe(200);
    await monnifyPayment();
    expect(await payouts()).toHaveLength(0);
    await t.mutation(f.daily.releaseDue, {});
    expect(await payouts()).toHaveLength(0);
    await t.mutation(f.daily.releaseDue, { today: tomorrow });
    expect(await payouts()).toHaveLength(3);
    const branch = (await t.query(f.branches.list, {})).find((b) => b.id === abuja)!;
    expect(branch.onHold).toBe(false);
  });

  test("a release date in the past is refused", async () => {
    const res = await post("branches/hold", { branchId: abuja, onHold: true, releaseOn: "2020-01-01" });
    expect(JSON.stringify(await res.json())).toContain("cannot be in the past");
  });
});

describe("daily money check", () => {
  test("finds a payment Monnify has that we missed, records it, and says so", async () => {
    await addClient(abuja);
    fake.accountTxns["client-ref-1"] = [{ transactionReference: "MNFY|MISSED", paymentStatus: "PAID", amountPaid: 50_000, paidOn: "2026-10-13 09:00:00.000" }];
    fake.paid["MNFY|MISSED"] = 50_000;
    const res = await post("check/run", {});
    const check = await res.json();
    expect(check.recovered).toBe(1);
    expect(check.lines.map((l: any) => l.text).join(" ")).toContain("missed");
    const recorded = await t.run(async (ctx) => await ctx.db.query("finPayments").collect());
    expect(recorded.map((p) => [p.reference, p.amountKobo])).toEqual([["MNFY|MISSED", 5_000_000]]);
    // Running again finds nothing new.
    expect((await (await post("check/run", {})).json()).recovered).toBe(0);
  });

  test("lists payouts waiting for an account", async () => {
    await addClient(abuja);
    await monnifyPayment();
    const check = await (await post("check/run", {})).json();
    expect(check.lines.some((l: any) => l.tone === "warn" && /waiting for/.test(l.text))).toBe(true);
  });
});

describe("staff photos", () => {
  test("a photo is saved and shown; a file over 5 MB is refused and removed", async () => {
    const { id } = await t.mutation(f.people.createStaff, {
      actorId: admin, name: "Musa Bala", branchId: abuja, role: "guard", basicKobo: 8_000_000, allowancesKobo: 0,
    });
    const photo = await t.run(async (ctx) => ctx.storage.store(new Blob(["img"], { type: "image/jpeg" })));
    await t.mutation(f.people.setStaffPhoto, { actorId: admin, staffId: id, storageId: photo });
    const [s] = await t.query(f.people.listStaff, {});
    expect(s.photoUrl).toBeTruthy();
    const big = await t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/jpeg" })));
    expect(await t.mutation(f.people.setStaffPhoto, { actorId: admin, staffId: id, storageId: big })).toEqual({ error: "Choose a photo (JPG or PNG) smaller than 5 MB" });
    expect(await t.run(async (ctx) => ctx.db.system.get(big))).toBeNull();
    expect((await t.query(f.people.listStaff, {}))[0].photoUrl).toBeTruthy();
  });
});
