/**
 * Head Office money settings (the Monnify wallet itself is fixed in env.ts):
 * optional separate accounts for
 * Head Office's own share and for VAT, and the "send automatically" switch.
 * Bank accounts reach here only after the bank confirmed them (see routes.ts).
 */
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { cleanAccountNumber } from "../lib/finance";
import { getMonnifyWallet } from "../env";
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
      sendDay: s?.sendDay ?? null,
      vatOnInvoices: s?.vatOnInvoices !== false,
      walletAccountNumber: getMonnifyWallet(),
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

/** When automatic sending happens: as money arrives (null) or once a month on a day. */
export const setSendDay = internalMutation({
  args: { actorId: v.id("users"), sendDay: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const day = args.sendDay;
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 28)) fail("Choose a day from 1 to 28");
    await upsert(ctx, args.actorId, { sendDay: day ?? undefined });
    await audit(ctx, args.actorId, "settings.sendday", "finSettings", "money", day ? `Branches are paid on day ${day} of each month` : "Branches are paid as soon as money arrives");
  },
});

export const setVatOnInvoices = internalMutation({
  args: { actorId: v.id("users"), on: v.boolean() },
  handler: async (ctx, args) => {
    await upsert(ctx, args.actorId, { vatOnInvoices: args.on });
    await audit(ctx, args.actorId, "settings.vat", "finSettings", "money", args.on ? "New invoices add 7.5% VAT" : "New invoices no longer add VAT");
  },
});

export const setAutoSend = internalMutation({
  args: { actorId: v.id("users"), autoSend: v.boolean() },
  handler: async (ctx, args) => {
    const s = await getSettings(ctx);
    if (args.autoSend) {
      if (!getMonnifyWallet()) fail("The Head Office Monnify account is not set up yet");
    }
    await upsert(ctx, args.actorId, { autoSend: args.autoSend });
    await audit(ctx, args.actorId, "settings.autosend", "finSettings", "money", args.autoSend ? "Turned automatic sending ON" : "Turned automatic sending OFF");
  },
});
