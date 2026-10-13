import type { HttpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { json, parseJson } from "../lib/http";
import { requireAuth } from "../lib/httpAuth";
import { badRequest, forbidden, serviceUnavailable, unauthorized } from "../lib/errors";
import { getMonnifyConfig } from "../env";
import { checkBankAccount, listBanks, monnifySignature, parsePaidOn, sameSignature, verifyTransaction } from "./monnify";

type User = { convexId: string; role: string };
type Body = Record<string, unknown>;
const fin = internal.finance;

/** Only the named fields go through, so a stray field can never reach the database. */
function pick(body: Body, keys: string[]) {
  const out: Body = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

function errorText(err: unknown): string | null {
  if (err instanceof ConvexError) return typeof err.data === "string" ? err.data : "That could not be saved";
  const message = err instanceof Error ? err.message : String(err);
  if (/ArgumentValidationError|Validator|does not match/i.test(message)) return "Some details are missing or not in the right format";
  return null;
}

/**
 * Registers the finance API. Every route is admin-only: Tarmac's finance
 * screens are for Head Office administrators.
 */
/** Asks the bank whose account this is; nothing is saved without its answer. */
async function bankChecked(body: Body) {
  const cfg = getMonnifyConfig();
  if (!cfg) throw new ConvexError("Bank accounts can only be added once Monnify is connected, so the bank can confirm the name.");
  return await checkBankAccount(cfg, body.bankCode, body.accountNumber);
}

export function registerFinanceRoutes(http: HttpRouter) {
  const route = (
    method: "GET" | "POST",
    path: string,
    run: (ctx: any, input: { body: Body; url: URL; actorId: any }) => Promise<unknown>,
  ) => {
    http.route({
      path: `/finance/${path}`,
      method,
      handler: httpAction(async (ctx, request) => {
        const user = (await requireAuth(ctx, request)) as User | null;
        if (!user) return unauthorized();
        if (user.role !== "admin") return forbidden("Only Head Office administrators can use the finance pages");
        const body = method === "POST" ? (((await parseJson(request)) as Body | null) ?? {}) : {};
        try {
          const result = await run(ctx, { body, url: new URL(request.url), actorId: user.convexId });
          return json(result ?? { ok: true });
        } catch (err) {
          const text = errorText(err);
          if (text) return badRequest(text);
          throw err;
        }
      }),
    });
  };
  const q = (url: URL, key: string) => url.searchParams.get(key) ?? undefined;

  // Overview & reports
  route("GET", "overview", (ctx) => ctx.runQuery(fin.overview.overview, {}));
  route("GET", "status", async () => {
    const cfg = getMonnifyConfig();
    return { monnifyConnected: !!cfg, monnifyMode: cfg ? (cfg.baseUrl.includes("sandbox") ? "test" : "live") : null };
  });

  // Banks: the list to pick from, and "whose account is this?"
  route("GET", "banks", async () => {
    const cfg = getMonnifyConfig();
    return cfg ? await listBanks(cfg) : [];
  });
  route("POST", "banks/check", (_ctx, { body }) => bankChecked(body));

  // Head Office money settings
  route("GET", "settings", (ctx) => ctx.runQuery(fin.settings.get, {}));
  route("POST", "settings/account", async (ctx, { body, actorId }) => {
    const which = body.which === "vat" ? "vat" : "hq";
    const account = body.remove && which === "vat" ? undefined : await bankChecked(body);
    await ctx.runMutation(fin.settings.setAccount, { actorId, which, account });
    return account ?? { ok: true };
  });
  route("POST", "settings/wallet", (ctx, { body, actorId }) => ctx.runMutation(fin.settings.setWallet, { actorId, ...pick(body, ["walletAccountNumber"]) } as any));
  route("POST", "settings/auto-send", (ctx, { body, actorId }) => ctx.runMutation(fin.settings.setAutoSend, { actorId, autoSend: body.autoSend === true }));

  // Money out
  route("GET", "payouts", (ctx) => ctx.runQuery(fin.payouts.list, {}));
  route("POST", "payouts/send-now", (ctx) => ctx.runAction(fin.payouts.sendReady, { manual: true }));
  route("POST", "payouts/code", (ctx, { body, actorId }) => ctx.runAction(fin.payouts.authorize, { actorId, ...pick(body, ["payoutId", "code"]) } as any));
  route("POST", "payouts/retry", (ctx, { body, actorId }) => ctx.runMutation(fin.payouts.retry, { actorId, ...pick(body, ["payoutId"]) } as any));

  // Daily money check
  route("GET", "check", (ctx) => ctx.runQuery(fin.daily.latestCheck, {}));
  route("POST", "check/run", async (ctx) => {
    await ctx.runAction(fin.daily.moneyCheck, {});
    return await ctx.runQuery(fin.daily.latestCheck, {});
  });
  route("GET", "reports", (ctx, { url }) => ctx.runQuery(fin.overview.reports, { period: q(url, "period") }));

  // Branches
  route("GET", "branches", (ctx) => ctx.runQuery(fin.branches.list, {}));
  route("POST", "branches/create", (ctx, { body, actorId }) => ctx.runMutation(fin.branches.create, { actorId, ...pick(body, ["name", "isHq"]) } as any));
  route("POST", "branches/update", async (ctx, { body, actorId }) => {
    const salaryAccount = body.removeSalaryAccount ? null : body.accountNumber ? await bankChecked(body) : undefined;
    return await ctx.runMutation(fin.branches.update, { actorId, ...pick(body, ["branchId", "name"]), salaryAccount } as any);
  });
  route("POST", "branches/hold", (ctx, { body, actorId }) =>
    ctx.runMutation(fin.branches.setHold, { actorId, ...pick(body, ["branchId", "onHold", "note", "releaseOn"]) } as any),
  );
  route("POST", "branches/split", (ctx, { body, actorId }) => ctx.runMutation(fin.branches.setSplit, { actorId, ...pick(body, ["branchId", "splitBps"]) } as any));

  // Partners
  const partnerKeys = ["name", "phone", "email"];
  route("GET", "partners", (ctx) => ctx.runQuery(fin.branches.listPartners, {}));
  route("POST", "partners/create", async (ctx, { body, actorId }) => {
    const account = await bankChecked(body);
    return await ctx.runMutation(fin.branches.createPartner, { actorId, ...pick(body, ["branchId", ...partnerKeys]), account } as any);
  });
  route("POST", "partners/update", async (ctx, { body, actorId }) => {
    const account = await bankChecked(body);
    return await ctx.runMutation(fin.branches.updatePartner, { actorId, ...pick(body, ["partnerId", ...partnerKeys]), account } as any);
  });
  route("POST", "partners/approve", (ctx, { body, actorId }) => ctx.runMutation(fin.branches.approvePartner, { actorId, ...pick(body, ["partnerId"]) } as any));
  route("POST", "partners/remove", (ctx, { body, actorId }) => ctx.runMutation(fin.branches.removePartner, { actorId, ...pick(body, ["partnerId"]) } as any));

  // Clients
  const clientKeys = ["name", "branchId", "contactName", "phone", "email", "address", "monthlyFeeKobo", "guards", "contractEnd"];
  route("GET", "clients", (ctx) => ctx.runQuery(fin.clients.list, {}));
  route("GET", "clients/get", (ctx, { url }) => ctx.runQuery(fin.clients.get, { clientId: q(url, "id") } as any));
  route("POST", "clients/create", (ctx, { body, actorId }) => ctx.runMutation(fin.clients.create, { actorId, ...pick(body, clientKeys) } as any));
  route("POST", "clients/update", (ctx, { body, actorId }) => ctx.runMutation(fin.clients.update, { actorId, ...pick(body, ["clientId", ...clientKeys]) } as any));
  route("POST", "clients/account", (ctx, { body, actorId }) =>
    ctx.runMutation(fin.clients.setPayAccount, { actorId, provider: "manual", ...pick(body, ["clientId", "bankName", "accountNumber", "accountName"]) } as any),
  );
  route("POST", "clients/create-account", (ctx, { body, actorId }) =>
    ctx.runAction(fin.monnify.createReservedAccount, { actorId, ...pick(body, ["clientId"]) } as any),
  );
  route("POST", "clients/status", (ctx, { body, actorId }) => ctx.runMutation(fin.clients.setStatus, { actorId, ...pick(body, ["clientId", "status"]) } as any));

  // Invoices
  route("GET", "invoices", (ctx) => ctx.runQuery(fin.invoices.list, {}));
  route("GET", "invoices/get", (ctx, { url }) => ctx.runQuery(fin.invoices.get, { invoiceId: q(url, "id") } as any));
  route("POST", "invoices/create", (ctx, { body, actorId }) =>
    ctx.runMutation(fin.invoices.create, { actorId, ...pick(body, ["clientId", "period", "lines", "dueDate", "notes"]) } as any),
  );
  route("POST", "invoices/monthly", (ctx, { body, actorId }) => ctx.runMutation(fin.invoices.createMonthly, { actorId, ...pick(body, ["period"]) } as any));
  route("POST", "invoices/update", (ctx, { body, actorId }) =>
    ctx.runMutation(fin.invoices.update, { actorId, ...pick(body, ["invoiceId", "lines", "dueDate", "notes"]) } as any),
  );
  route("POST", "invoices/send", (ctx, { body, actorId }) => ctx.runMutation(fin.invoices.markSent, { actorId, ...pick(body, ["invoiceId"]) } as any));
  route("POST", "invoices/cancel", (ctx, { body, actorId }) => ctx.runMutation(fin.invoices.cancel, { actorId, ...pick(body, ["invoiceId"]) } as any));

  // Payments
  route("GET", "payments", (ctx, { url }) => ctx.runQuery(fin.payments.list, { period: q(url, "period") }));
  route("POST", "payments/record", (ctx, { body, actorId }) =>
    ctx.runMutation(fin.payments.record, { actorId, ...pick(body, ["clientId", "amountKobo", "receivedAt", "method", "reference", "note"]) } as any),
  );
  route("POST", "payments/release", (ctx, { body, actorId }) => ctx.runMutation(fin.payments.release, { actorId, ...pick(body, ["paymentId"]) } as any));
  route("POST", "payments/undo", (ctx, { body, actorId }) => ctx.runMutation(fin.payments.undoManual, { actorId, ...pick(body, ["paymentId"]) } as any));

  // Staff, applicants, roster
  const staffKeys = [
    "name", "phone", "branchId", "role", "post", "startDate", "basicKobo", "allowancesKobo", "nhf",
    "bankName", "accountNumber", "pensionPin", "guarantorName", "guarantorPhone", "guarantorVerified",
  ];
  // A staff account picked from the bank list is checked with the bank; the
  // bank's name replaces whatever was typed. Without Monnify it is saved as typed.
  const staffBank = async (body: Body) => {
    if (!body.accountNumber || !body.bankCode || !getMonnifyConfig()) return {};
    const a = await bankChecked(body);
    return { bankCode: a.bankCode, bankName: a.bankName, accountNumber: a.accountNumber, accountName: a.accountName };
  };
  route("GET", "staff", (ctx) => ctx.runQuery(fin.people.listStaff, {}));
  route("POST", "staff/create", async (ctx, { body, actorId }) =>
    ctx.runMutation(fin.people.createStaff, { actorId, ...pick(body, staffKeys), ...(await staffBank(body)) } as any),
  );
  route("POST", "staff/update", async (ctx, { body, actorId }) =>
    ctx.runMutation(fin.people.updateStaff, { actorId, ...pick(body, ["staffId", ...staffKeys]), ...(await staffBank(body)) } as any),
  );
  route("POST", "staff/photo-upload", async (ctx) => ({ uploadUrl: await ctx.storage.generateUploadUrl() }));
  route("POST", "staff/photo", async (ctx, { body, actorId }) => {
    const r = await ctx.runMutation(fin.people.setStaffPhoto, { actorId, ...pick(body, ["staffId", "storageId"]) } as any);
    if (r.error) throw new ConvexError(r.error);
    return { ok: true };
  });
  route("POST", "staff/status", (ctx, { body, actorId }) => ctx.runMutation(fin.people.setStaffStatus, { actorId, ...pick(body, ["staffId", "status"]) } as any));
  route("GET", "applicants", (ctx) => ctx.runQuery(fin.people.listApplicants, {}));
  route("POST", "applicants/create", (ctx, { body, actorId }) =>
    ctx.runMutation(fin.people.createApplicant, { actorId, ...pick(body, ["name", "phone", "branchId", "guarantorName", "guarantorPhone", "notes"]) } as any),
  );
  route("POST", "applicants/update", (ctx, { body, actorId }) =>
    ctx.runMutation(fin.people.updateApplicant, {
      actorId,
      ...pick(body, ["applicantId", "stage", "guarantorName", "guarantorPhone", "guarantorVerified", "notes"]),
    } as any),
  );
  route("POST", "applicants/hire", (ctx, { body, actorId }) =>
    ctx.runMutation(fin.people.hireApplicant, { actorId, ...pick(body, ["applicantId", "role", "post", "basicKobo", "allowancesKobo", "startDate"]) } as any),
  );
  route("GET", "roster", (ctx, { url }) => ctx.runQuery(fin.people.rosterWeek, { branchId: q(url, "branchId"), day: q(url, "day") } as any));
  route("POST", "roster/set", (ctx, { body, actorId }) => ctx.runMutation(fin.people.setShift, { actorId, ...pick(body, ["staffId", "date", "shift"]), shift: body.shift ?? null } as any));

  // Payroll
  route("GET", "payroll", (ctx, { url }) => ctx.runQuery(fin.payroll.get, { branchId: q(url, "branchId"), period: q(url, "period") } as any));
  route("POST", "payroll/generate", (ctx, { body, actorId }) => ctx.runMutation(fin.payroll.generate, { actorId, ...pick(body, ["branchId", "period"]) } as any));
  route("POST", "payroll/approve", (ctx, { body, actorId }) => ctx.runMutation(fin.payroll.approve, { actorId, ...pick(body, ["runId"]) } as any));
  route("POST", "payroll/paid", (ctx, { body, actorId }) => ctx.runMutation(fin.payroll.markPaid, { actorId, ...pick(body, ["runId"]) } as any));

  // Monnify tells us when money lands in a client's account. No login: the
  // request is trusted only if its signature matches our secret key AND
  // Monnify confirms the transaction when we ask it directly.
  http.route({
    path: "/finance/monnify/webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const cfg = getMonnifyConfig();
      if (!cfg) return serviceUnavailable("Monnify is not connected");
      const raw = await request.text();
      const signature = (request.headers.get("monnify-signature") ?? "").toLowerCase();
      if (!signature || !sameSignature(signature, await monnifySignature(cfg.secretKey, raw))) {
        return unauthorized("Bad signature");
      }
      let event: any;
      try {
        event = JSON.parse(raw);
      } catch {
        return badRequest("Not JSON");
      }
      const data = event?.eventData ?? {};
      if (event?.eventType !== "SUCCESSFUL_TRANSACTION" || data?.product?.type !== "RESERVED_ACCOUNT") {
        return json({ ok: true, ignored: true });
      }
      const reference = String(data.transactionReference ?? "");
      const amountPaid = Number(data.amountPaid);
      if (!reference || !Number.isFinite(amountPaid) || amountPaid <= 0) return badRequest("Missing transaction details");
      const check = await verifyTransaction(cfg, reference);
      if (!check.paid || Math.round(check.amountPaid * 100) !== Math.round(amountPaid * 100)) {
        return badRequest("Transaction could not be confirmed with Monnify");
      }
      const result = await ctx.runMutation(fin.monnify.recordWebhookPayment, {
        accountRef: String(data.product.reference ?? ""),
        reference,
        amountKobo: Math.round(amountPaid * 100),
        receivedAt: parsePaidOn(data.paidOn),
      });
      return json({ ok: true, ...result });
    }),
  });
}
