/**
 * Head Office money settings: the Monnify wallet (Head Office's account, the pot
 * every payment lands in and is sent from), optional separate accounts for
 * Head Office's own share and for VAT, and the "send automatically" switch.
 * Bank accounts reach here only after the bank confirmed them (see routes.ts).
 */
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { cleanAccountNumber } from "../lib/finance";
import { fillWaiting, getSettings } from "./payouts";
import { audit, fail } from "./shared";

export const checkedAccount = v.object({
  bankCode: v.string(),
  bankName: v.string(),
  accountNumber: v.string(),
  accountName: v.string(),
});

async function upsert(ctx: MutationCtx, actorId: Doc<"finSettings">["updatedBy"], patch: Partial<Doc<"finSettings">>) {
  const row = await getSettings(ctx);
  if (row) {
    await ctx.db.patch(row._id, { ...patch, updatedBy: actorId, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("finSettings", { key: "money", autoSend: false, ...patch, updatedBy: actorId, updatedAt: Date.now() });
  }
}

export const get = internalQuery({
  args: {},
  handler: async (ctx) => {
    const s = await getSettings(ctx);
    const account = (code?: string, bank?: string, number?: string, name?: string) =>
      code && number && name ? { bankCode: code, bankName: bank ?? "", accountNumber: number, accountName: name } : null;
    return {
      autoSend: !!s?.autoSend,
      walletAccountNumber: s?.walletAccountNumber ?? null,
      hq: account(s?.hqBankCode, s?.hqBankName, s?.hqAccountNumber, s?.hqAccountName),
      vat: account(s?.vatBankCode, s?.vatBankName, s?.vatAccountNumber, s?.vatAccountName),
    };
  },
});

export const setAccount = internalMutation({
  args: { actorId: v.id("users"), which: v.union(v.literal("hq"), v.literal("vat")), account: v.optional(checkedAccount) },
  handler: async (ctx, args) => {
    const a = args.account;
    const prefix = args.which;
    await upsert(ctx, args.actorId, {
      [`${prefix}BankCode`]: a?.bankCode,
      [`${prefix}BankName`]: a?.bankName,
      [`${prefix}AccountNumber`]: a ? cleanAccountNumber(a.accountNumber) : undefined,
      [`${prefix}AccountName`]: a?.accountName,
    });
    const label = args.which === "hq" ? "Head Office" : "VAT";
    await audit(
      ctx,
      args.actorId,
      "settings.account",
      "finSettings",
      "money",
      a ? `${label} share now goes to ${a.bankName} ${a.accountNumber} (${a.accountName})` : `${label} share now stays in Head Office's Monnify account`,
    );
    await fillWaiting(ctx);
  },
});

export const setWallet = internalMutation({
  args: { actorId: v.id("users"), walletAccountNumber: v.string() },
  handler: async (ctx, args) => {
    const number = cleanAccountNumber(args.walletAccountNumber);
    await upsert(ctx, args.actorId, { walletAccountNumber: number });
    await audit(ctx, args.actorId, "settings.wallet", "finSettings", "money", `Monnify wallet set to ${number}`);
  },
});

export const setAutoSend = internalMutation({
  args: { actorId: v.id("users"), autoSend: v.boolean() },
  handler: async (ctx, args) => {
    const s = await getSettings(ctx);
    if (args.autoSend) {
      if (!s?.walletAccountNumber) fail("Add the Head Office (Monnify) account number first");
    }
    await upsert(ctx, args.actorId, { autoSend: args.autoSend });
    await audit(ctx, args.actorId, "settings.autosend", "finSettings", "money", args.autoSend ? "Turned automatic sending ON" : "Turned automatic sending OFF");
  },
});
