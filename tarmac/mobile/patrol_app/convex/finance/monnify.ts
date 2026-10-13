/**
 * Monnify: each client's own account number (a "reserved account"), and the
 * notifications Monnify sends when money lands in one.
 *
 * Switched on by MONNIFY_API_KEY, MONNIFY_SECRET_KEY and MONNIFY_CONTRACT_CODE
 * (see env.ts). Until then this file is inert and payments are typed in.
 *
 * Money going out (payouts), bank-name checks and the daily check use the
 * helpers at the bottom of this file; see payouts.ts and daily.ts.
 */
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { getMonnifyConfig } from "../env";
import { applyPayment } from "./payments";
import { audit } from "./shared";

export type MonnifyConfig = NonNullable<ReturnType<typeof getMonnifyConfig>>;

async function monnifyJson(res: Response) {
  const body = (await res.json().catch(() => null)) as
    | { requestSuccessful?: boolean; responseMessage?: string; responseBody?: any }
    | null;
  if (!res.ok || !body?.requestSuccessful) {
    throw new ConvexError(`Monnify said: ${body?.responseMessage ?? `error ${res.status}`}`);
  }
  return body.responseBody;
}

export async function monnifyToken(cfg: MonnifyConfig): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${cfg.apiKey}:${cfg.secretKey}`)}` },
  });
  return (await monnifyJson(res)).accessToken as string;
}

/** HMAC-SHA512 of the raw body with the secret key, as hex (Monnify's signature). */
export async function monnifySignature(secretKey: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretKey), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function sameSignature(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Asks Monnify directly whether a transaction really was paid, and how much. */
export async function verifyTransaction(cfg: MonnifyConfig, transactionReference: string) {
  const token = await monnifyToken(cfg);
  const res = await fetch(`${cfg.baseUrl}/api/v2/transactions/${encodeURIComponent(transactionReference)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await monnifyJson(res);
  return { paid: body.paymentStatus === "PAID", amountPaid: Number(body.amountPaid) };
}

/** Gives a client their own permanent account number through Monnify. */
export const createReservedAccount = internalAction({
  args: { actorId: v.id("users"), clientId: v.id("finClients") },
  handler: async (ctx, args): Promise<{ bankName: string; accountNumber: string }> => {
    const cfg = getMonnifyConfig();
    if (!cfg) throw new ConvexError("Monnify is not connected yet. Type the account number in by hand for now.");
    const client = await ctx.runQuery(internal.finance.clients.get, { clientId: args.clientId });
    if (!client) throw new ConvexError("Client not found");
    if (client.payAccountNumber) throw new ConvexError(`${client.name} already has an account number`);
    if (!client.email) throw new ConvexError("Add the client's email address first — Monnify needs it to open the account");
    const token = await monnifyToken(cfg);
    const res = await fetch(`${cfg.baseUrl}/api/v2/bank-transfer/reserved-accounts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        accountReference: client.id,
        accountName: client.name,
        currencyCode: "NGN",
        contractCode: cfg.contractCode,
        customerEmail: client.email,
        customerName: client.name,
        getAllAvailableBanks: true,
      }),
    });
    const body = await monnifyJson(res).catch((err) => {
      if (err instanceof ConvexError && /more than 1 account/i.test(String(err.data))) {
        throw new ConvexError(
          `This email (${client.email}) already has a Monnify account number for another client. Give ${client.name} its own email address and try again.`,
        );
      }
      throw err;
    });
    const account = body.accounts?.[0];
    if (!account?.accountNumber) throw new ConvexError("Monnify did not return an account number");
    // The create answer can carry a shortened name; the account itself has the full one.
    let fullName: string | undefined = body.accountName;
    try {
      const again = await fetch(`${cfg.baseUrl}/api/v2/bank-transfer/reserved-accounts/${encodeURIComponent(client.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fullName = (await monnifyJson(again)).accountName ?? fullName;
    } catch {
      // Keep whatever name we already have; the account number is what matters.
    }
    await ctx.runMutation(internal.finance.clients.setPayAccount, {
      actorId: args.actorId,
      clientId: args.clientId,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      // The full name (e.g. "ANDRIL-Rayfield Estate") is on the reserved account;
      // each bank line may carry only a shortened form.
      accountName: fullName ?? account.accountName ?? client.name,
      accountRef: client.id,
      provider: "monnify",
    });
    return { bankName: account.bankName, accountNumber: account.accountNumber };
  },
});

/** Called by the webhook once the signature and the amount are verified. */
export const recordWebhookPayment = internalMutation({
  args: {
    accountRef: v.string(),
    reference: v.string(),
    amountKobo: v.number(),
    receivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("finClients")
      .withIndex("by_payAccountRef", (q) => q.eq("payAccountRef", args.accountRef))
      .first();
    if (!client) {
      await audit(ctx, "monnify", "payment.unmatched", "monnify", args.reference, `Money arrived for unknown account reference ${args.accountRef}`);
      return { status: "unmatched" as const };
    }
    const result = await applyPayment(ctx, {
      clientId: client._id,
      amountKobo: args.amountKobo,
      receivedAt: args.receivedAt,
      reference: args.reference,
      source: "monnify",
      method: "Bank transfer",
    });
    return { status: result.duplicate ? ("duplicate" as const) : ("recorded" as const) };
  },
});

/** Monnify sends times like "2026-10-13 10:57:53.474" (Nigerian time). */
export function parsePaidOn(value: unknown): number {
  const s = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi, se] = m.map(Number);
    return Date.UTC(y, mo - 1, d, h, mi, se) - 60 * 60 * 1000;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

// ------------------------------------------------------------ money out

/**
 * One Monnify call that never throws on Monnify's own refusals: the caller
 * decides what a refusal means. `unclear` is true when we cannot know whether
 * Monnify acted (network failure, server error) — money calls must then ask
 * again rather than assume.
 */
export async function monnifyCall(
  cfg: MonnifyConfig,
  token: string,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<{ ok: boolean; unclear: boolean; message: string; body: any }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, unclear: true, message: "Could not reach Monnify", body: null };
  }
  const data = (await res.json().catch(() => null)) as { requestSuccessful?: boolean; responseMessage?: string; responseBody?: any } | null;
  if (res.status >= 500 || !data) return { ok: false, unclear: true, message: data?.responseMessage ?? `Monnify error ${res.status}`, body: null };
  return { ok: !!data.requestSuccessful && res.ok, unclear: false, message: data.responseMessage ?? "", body: data.responseBody };
}

let bankCache: { at: number; banks: { code: string; name: string }[] } | null = null;

/** Nigerian banks Monnify can send to, sorted by name. Cached for an hour. */
export async function listBanks(cfg: MonnifyConfig) {
  if (bankCache && Date.now() - bankCache.at < 60 * 60 * 1000) return bankCache.banks;
  const token = await monnifyToken(cfg);
  const r = await monnifyCall(cfg, token, "/api/v1/banks");
  if (!r.ok || !Array.isArray(r.body)) throw new ConvexError("Could not load the list of banks from Monnify. Try again.");
  const seen = new Set<string>();
  const banks = (r.body as { code?: string; name?: string }[])
    .filter((b) => b.code && b.name && !seen.has(b.code) && seen.add(b.code))
    .map((b) => ({ code: String(b.code), name: String(b.name).trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bankCache = { at: Date.now(), banks };
  return banks;
}

/**
 * Asks the bank whose account this is. The name we save is always the bank's
 * answer, never what someone typed.
 */
export async function checkBankAccount(cfg: MonnifyConfig, bankCode: unknown, accountNumber: unknown) {
  const code = String(bankCode ?? "").trim();
  if (!/^\d{3,6}$/.test(code)) throw new ConvexError("Choose the bank from the list");
  const number = String(accountNumber ?? "").replace(/\D/g, "");
  if (number.length !== 10) throw new ConvexError("Account number must be 10 digits");
  const banks = await listBanks(cfg);
  const bank = banks.find((b) => b.code === code);
  if (!bank) throw new ConvexError("Choose the bank from the list");
  const token = await monnifyToken(cfg);
  const r = await monnifyCall(cfg, token, `/api/v2/disbursements/account/validate?accountNumber=${number}&bankCode=${code}`);
  if (r.unclear) throw new ConvexError("The bank did not answer. Try again in a minute.");
  if (!r.ok || !r.body?.accountName) {
    throw new ConvexError(`Account not found. Check that ${number} is a ${bank.name} account.`);
  }
  return { bankCode: code, bankName: bank.name, accountNumber: number, accountName: String(r.body.accountName).trim() };
}

export type TransferResult =
  | { state: "sent"; feeKobo?: number }
  | { state: "sending" }
  | { state: "needs_code" }
  | { state: "failed"; error: string }
  | { state: "unknown" }; // not found at Monnify: safe to send again with the same reference

function transferState(body: any, message: string): TransferResult {
  const status = String(body?.status ?? "").toUpperCase();
  const fee = Number(body?.totalFee);
  if (status === "SUCCESS") return { state: "sent", feeKobo: Number.isFinite(fee) ? Math.round(fee * 100) : undefined };
  if (status === "PENDING_AUTHORIZATION") return { state: "needs_code" };
  if (["FAILED", "REVERSED", "EXPIRED", "CANCELLED", "REJECTED"].includes(status)) return { state: "failed", error: message || `Monnify: ${status.toLowerCase()}` };
  return { state: "sending" };
}

/** Where a transfer stands at Monnify, by our reference. */
export async function transferStatus(cfg: MonnifyConfig, token: string, reference: string): Promise<TransferResult> {
  const r = await monnifyCall(cfg, token, `/api/v2/disbursements/single/summary?reference=${encodeURIComponent(reference)}`);
  if (r.unclear) return { state: "sending" };
  if (!r.ok) return /not found|does not exist|no transaction/i.test(r.message) ? { state: "unknown" } : { state: "sending" };
  return transferState(r.body, r.message);
}

/** Sends one transfer from Head Office's Monnify wallet. */
export async function sendTransfer(
  cfg: MonnifyConfig,
  token: string,
  t: { reference: string; amountKobo: number; narration: string; bankCode: string; accountNumber: string; accountName: string; walletAccountNumber: string },
): Promise<TransferResult> {
  const r = await monnifyCall(cfg, token, "/api/v2/disbursements/single", {
    method: "POST",
    body: {
      amount: t.amountKobo / 100,
      reference: t.reference,
      narration: t.narration.slice(0, 50),
      destinationBankCode: t.bankCode,
      destinationAccountNumber: t.accountNumber,
      destinationAccountName: t.accountName,
      currency: "NGN",
      sourceAccountNumber: t.walletAccountNumber,
    },
  });
  if (r.unclear) return { state: "sending" };
  if (!r.ok) {
    // We sent this reference before and lost the answer: ask instead of guessing.
    if (/duplicate|already exist|already been used/i.test(r.message)) return await transferStatus(cfg, token, t.reference);
    return { state: "failed", error: r.message || "Monnify refused the transfer" };
  }
  return transferState(r.body, r.message);
}

/** The email code Monnify sends when two-step approval is on. */
export async function authorizeTransfer(cfg: MonnifyConfig, token: string, reference: string, code: string): Promise<TransferResult> {
  const r = await monnifyCall(cfg, token, "/api/v2/disbursements/single/validate-otp", {
    method: "POST",
    body: { reference, authorizationCode: code },
  });
  if (r.unclear) return { state: "sending" };
  if (!r.ok) throw new ConvexError(r.message ? `Monnify said: ${r.message}` : "That code was not accepted");
  return transferState(r.body, r.message);
}

/** Recent payments into one client's account, as Monnify has them. */
export async function accountTransactions(cfg: MonnifyConfig, token: string, accountRef: string) {
  const r = await monnifyCall(cfg, token, `/api/v1/bank-transfer/reserved-accounts/transactions?accountReference=${encodeURIComponent(accountRef)}&page=0&size=50`);
  if (!r.ok) return null;
  const content: any[] = Array.isArray(r.body?.content) ? r.body.content : [];
  return content
    .filter((x) => String(x.paymentStatus ?? "").toUpperCase() === "PAID" && x.transactionReference)
    .map((x) => ({
      reference: String(x.transactionReference),
      amountKobo: Math.round(Number(x.amountPaid ?? x.amount) * 100),
      paidOn: x.paidOn ?? x.completedOn ?? x.createdOn,
    }));
}
