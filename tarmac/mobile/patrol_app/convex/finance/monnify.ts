/**
 * Monnify: each client's own account number (a "reserved account"), and the
 * notifications Monnify sends when money lands in one.
 *
 * Switched on by MONNIFY_API_KEY, MONNIFY_SECRET_KEY and MONNIFY_CONTRACT_CODE
 * (see env.ts). Until then this file is inert and payments are typed in.
 *
 * Automatic payouts to partners and salary accounts (Monnify sub-accounts and
 * split rules) are added once Tarmac's sandbox keys exist and can be tested.
 */
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { getMonnifyConfig } from "../env";
import { applyPayment } from "./payments";
import { audit } from "./shared";

type MonnifyConfig = NonNullable<ReturnType<typeof getMonnifyConfig>>;

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
