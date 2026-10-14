/**
 * Money out. Head Office's Monnify wallet is the pot every payment lands in.
 * Each shared Monnify payment is cut four ways: the branch partner's and the
 * branch salary shares are sent out to ordinary bank accounts (checked with the
 * bank when added); Head Office's own share and VAT stay in the pot unless an
 * admin names a separate account for them.
 *
 * Never pay twice: a payout is claimed ("sending") before Monnify is called,
 * and every retry of an attempt re-uses its reference, which Monnify refuses
 * to pay a second time. Only a definite failure gets a new reference.
 */
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { getMonnifyConfig } from "../env";
import { authorizeTransfer, monnifyToken, sendTransfer, transferStatus, walletBalance, type TransferResult } from "./monnify";
import { audit, fail, nextNumber, periodOf, periodRange } from "./shared";

export const SHARES = ["hq", "vat", "partner", "salary"] as const;
export type Share = (typeof SHARES)[number];
export const SHARE_LABEL: Record<Share, string> = { hq: "Head Office", vat: "VAT", partner: "Partner", salary: "Salaries" };

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export async function getSettings(ctx: QueryCtx) {
  return await ctx.db
    .query("finSettings")
    .withIndex("by_key", (q) => q.eq("key", "money"))
    .unique();
}

type Account = { toName: string; bankCode: string; bankName: string; accountNumber: string; accountName: string };
/** keep = the share stays in Head Office's Monnify wallet; nothing is sent. */
type Destination = Account | { waitingFor: string } | { keep: true };
const KEEP = { keep: true } as const;

function hqAccount(settings: Doc<"finSettings"> | null, toName: string): Account | null {
  if (!settings?.hqBankCode || !settings.hqAccountNumber || !settings.hqAccountName) return null;
  return {
    toName,
    bankCode: settings.hqBankCode,
    bankName: settings.hqBankName ?? "",
    accountNumber: settings.hqAccountNumber,
    accountName: settings.hqAccountName,
  };
}

/** Where one share of a branch's payment goes, from the accounts on file now. */
async function destinationFor(
  ctx: QueryCtx,
  branch: Doc<"finBranches">,
  share: Share,
  partnerId: Id<"finPartners"> | undefined,
  settings: Doc<"finSettings"> | null,
): Promise<Destination> {
  if (share === "hq") return hqAccount(settings, "Head Office's own account") ?? KEEP;
  if (share === "vat") {
    if (settings?.vatBankCode && settings.vatAccountNumber && settings.vatAccountName) {
      return {
        toName: "VAT account",
        bankCode: settings.vatBankCode,
        bankName: settings.vatBankName ?? "",
        accountNumber: settings.vatAccountNumber,
        accountName: settings.vatAccountName,
      };
    }
    // Without a VAT account, VAT stays in Head Office's wallet, set aside for the tax office.
    return KEEP;
  }
  if (share === "salary") {
    if (branch.salaryBankCode && branch.salaryAccountNumber && branch.salaryAccountName) {
      return {
        toName: `${branch.name} salaries`,
        bankCode: branch.salaryBankCode,
        bankName: branch.salaryBankName ?? "",
        accountNumber: branch.salaryAccountNumber,
        accountName: branch.salaryAccountName,
      };
    }
    return { waitingFor: `${branch.name}'s salary account` };
  }
  // The partner when the payment came in; if they have since been replaced,
  // the branch's current approved partner (the old one can no longer be paid).
  let partner = partnerId ? await ctx.db.get(partnerId) : null;
  if (!partner || partner.status !== "active") partner = branch.partnerId ? await ctx.db.get(branch.partnerId) : null;
  if (partner && partner.status === "active") {
    if (!partner.bankCode) return { waitingFor: `${partner.name}'s bank account to be checked again` };
    return {
      toName: `${branch.name} partner — ${partner.name}`,
      bankCode: partner.bankCode,
      bankName: partner.bankName,
      accountNumber: partner.accountNumber,
      accountName: partner.accountName,
    };
  }
  // Head Office has no partner, so its partner share is Head Office's: it stays in the wallet.
  if (branch.isHq) return KEEP;
  return { waitingFor: `an approved partner for ${branch.name}` };
}

function destinationPatch(dest: Exclude<Destination, { keep: true }>) {
  if ("waitingFor" in dest) {
    return {
      status: "waiting" as const,
      waitingFor: dest.waitingFor,
      toName: undefined,
      bankCode: undefined,
      bankName: undefined,
      accountNumber: undefined,
      accountName: undefined,
    };
  }
  return { status: "ready" as const, waitingFor: undefined, ...dest };
}

async function scheduleSend(ctx: MutationCtx) {
  const settings = await getSettings(ctx);
  if (settings?.autoSend) await ctx.scheduler.runAfter(0, internal.finance.payouts.sendReady, {});
}

/** Makes the four payouts for a payment that has just been shared. Safe to call twice. */
export async function createPayouts(ctx: MutationCtx, payment: Doc<"finPayments">) {
  // Only money that landed in the Monnify wallet can be sent from it. Payments
  // typed in by hand were paid somewhere else; Head Office shares those itself.
  if (payment.state !== "shared" || payment.source !== "monnify") return;
  const existing = await ctx.db
    .query("finPayouts")
    .withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id))
    .first();
  if (existing) return;
  const branch = await ctx.db.get(payment.branchId);
  if (!branch) return;
  const settings = await getSettings(ctx);
  const now = Date.now();
  for (const share of SHARES) {
    const amountKobo = payment.split[share];
    if (amountKobo <= 0) continue;
    const dest = await destinationFor(ctx, branch, share, payment.partnerId, settings);
    if ("keep" in dest) continue;
    await ctx.db.insert("finPayouts", {
      paymentId: payment._id,
      branchId: branch._id,
      share,
      amountKobo,
      ...destinationPatch(dest),
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  await scheduleSend(ctx);
}

/** Payouts that were waiting for an account pick it up once it exists. */
export async function fillWaiting(ctx: MutationCtx) {
  const waiting = await ctx.db
    .query("finPayouts")
    .withIndex("by_status", (q) => q.eq("status", "waiting"))
    .collect();
  if (!waiting.length) return 0;
  const settings = await getSettings(ctx);
  let filled = 0;
  for (const p of waiting) {
    const branch = await ctx.db.get(p.branchId);
    const payment = await ctx.db.get(p.paymentId);
    if (!branch || !payment) continue;
    const dest = await destinationFor(ctx, branch, p.share, payment.partnerId, settings);
    if ("keep" in dest) {
      // Nothing to send any more: the share stays in Head Office's wallet.
      await ctx.db.delete(p._id);
      continue;
    }
    if ("waitingFor" in dest) {
      if (dest.waitingFor !== p.waitingFor) await ctx.db.patch(p._id, { waitingFor: dest.waitingFor, updatedAt: Date.now() });
      continue;
    }
    await ctx.db.patch(p._id, { ...destinationPatch(dest), updatedAt: Date.now() });
    filled++;
  }
  if (filled) await scheduleSend(ctx);
  return filled;
}

// ------------------------------------------------------------- sending

export const readyIds = internalQuery({
  args: { status: v.union(v.literal("ready"), v.literal("sending")) },
  handler: async (ctx, args) =>
    (await ctx.db
      .query("finPayouts")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .take(25)).map((p) => p._id),
});

export const sendSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const s = await getSettings(ctx);
    return { autoSend: !!s?.autoSend, walletAccountNumber: s?.walletAccountNumber ?? null };
  },
});

/** Claims a ready payout for sending and gives it a reference if it has none. */
export const claim = internalMutation({
  args: { payoutId: v.id("finPayouts") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.status !== "ready" || !p.bankCode || !p.accountNumber || !p.accountName) return null;
    let reference = p.reference;
    let attempts = p.attempts;
    if (!reference) {
      reference = `TSL-OUT-${String(await nextNumber(ctx, "payout")).padStart(6, "0")}`;
      attempts += 1;
    }
    await ctx.db.patch(p._id, { status: "sending", reference, attempts, error: undefined, updatedAt: Date.now() });
    const branch = await ctx.db.get(p.branchId);
    return {
      reference,
      amountKobo: p.amountKobo,
      narration: `Tarmac ${SHARE_LABEL[p.share]} ${branch?.name ?? ""}`.trim(),
      bankCode: p.bankCode,
      accountNumber: p.accountNumber,
      accountName: p.accountName,
    };
  },
});

const resultValidator = v.object({
  state: v.union(v.literal("sent"), v.literal("sending"), v.literal("needs_code"), v.literal("failed"), v.literal("unknown")),
  feeKobo: v.optional(v.number()),
  error: v.optional(v.string()),
});

/** Records what Monnify said about a payout. */
export const settle = internalMutation({
  args: { payoutId: v.id("finPayouts"), result: resultValidator },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.status === "sent") return;
    const r = args.result;
    const now = Date.now();
    if (r.state === "sent") {
      await ctx.db.patch(p._id, { status: "sent", sentAt: now, feeKobo: r.feeKobo, error: undefined, updatedAt: now });
      await audit(ctx, "monnify", "payout.sent", "finPayout", p._id, `Sent ${naira(p.amountKobo)} to ${p.toName} (${p.bankName} ${p.accountNumber}), ref ${p.reference}`);
    } else if (r.state === "failed") {
      await ctx.db.patch(p._id, { status: "failed", error: r.error ?? "Monnify refused the transfer", updatedAt: now });
      await audit(ctx, "monnify", "payout.failed", "finPayout", p._id, `Could not send ${naira(p.amountKobo)} to ${p.toName}: ${r.error ?? "refused"}`);
    } else if (r.state === "needs_code") {
      await ctx.db.patch(p._id, { status: "needs_code", updatedAt: now });
    } else if (r.state === "unknown") {
      // Monnify never got it: send again later with the same reference.
      await ctx.db.patch(p._id, { status: "ready", updatedAt: now });
    } else {
      await ctx.db.patch(p._id, { status: "sending", updatedAt: now });
    }
  },
});

const plain = (r: TransferResult) => ({
  state: r.state,
  feeKobo: r.state === "sent" ? r.feeKobo : undefined,
  error: r.state === "failed" ? r.error : undefined,
});

/**
 * Sends ready payouts. Runs on its own only when "send automatically" is on;
 * `manual` is the admin pressing "Send now".
 */
export const sendReady = internalAction({
  args: { manual: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ sent: number; waiting: number; failed: number; reason?: string }> => {
    const cfg = getMonnifyConfig();
    if (!cfg) return { sent: 0, waiting: 0, failed: 0, reason: "Monnify is not connected yet" };
    const settings = await ctx.runQuery(internal.finance.payouts.sendSettings, {});
    if (!settings.walletAccountNumber) return { sent: 0, waiting: 0, failed: 0, reason: "Add the Head Office (Monnify) account number on the Money out page first" };
    if (!args.manual && !settings.autoSend) return { sent: 0, waiting: 0, failed: 0, reason: "Automatic sending is off" };
    const ids = await ctx.runQuery(internal.finance.payouts.readyIds, { status: "ready" });
    if (!ids.length) return { sent: 0, waiting: 0, failed: 0 };
    const token = await monnifyToken(cfg);
    const count = { sent: 0, waiting: 0, failed: 0 };
    // Never ask Monnify to send more than the Head Office account holds: what
    // does not fit stays "ready" and goes out once more money comes in.
    const balance = await walletBalance(cfg, settings.walletAccountNumber);
    let left = balance.available ? balance.availableKobo : Infinity;
    let short = 0;
    for (const id of ids) {
      const p = await ctx.runQuery(internal.finance.payouts.one, { payoutId: id });
      if (!p) continue;
      if (p.amountKobo > left) {
        short += p.amountKobo;
        continue;
      }
      const t = await ctx.runMutation(internal.finance.payouts.claim, { payoutId: id });
      if (!t) continue;
      const result = await sendTransfer(cfg, token, { ...t, walletAccountNumber: settings.walletAccountNumber });
      await ctx.runMutation(internal.finance.payouts.settle, { payoutId: id, result: plain(result) });
      if (result.state !== "failed") left -= p.amountKobo;
      if (result.state === "sent") count.sent++;
      else if (result.state === "failed") count.failed++;
      else count.waiting++;
    }
    if (short) {
      const n = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
      return { ...count, reason: `Not enough money in the Head Office account for everything: ${n(short)} is still waiting and will go out when more money comes in.` };
    }
    if (ids.length === 25) await ctx.scheduler.runAfter(0, internal.finance.payouts.sendReady, { manual: args.manual });
    return count;
  },
});

/** Asks Monnify about payouts still marked "sending". */
export const recheckSending = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const cfg = getMonnifyConfig();
    if (!cfg) return 0;
    const ids = await ctx.runQuery(internal.finance.payouts.readyIds, { status: "sending" });
    if (!ids.length) return 0;
    const token = await monnifyToken(cfg);
    for (const id of ids) {
      const ref = await ctx.runQuery(internal.finance.payouts.referenceOf, { payoutId: id });
      if (!ref) continue;
      await ctx.runMutation(internal.finance.payouts.settle, { payoutId: id, result: plain(await transferStatus(cfg, token, ref)) });
    }
    return ids.length;
  },
});

export const referenceOf = internalQuery({
  args: { payoutId: v.id("finPayouts") },
  handler: async (ctx, args) => (await ctx.db.get(args.payoutId))?.reference ?? null,
});

/** Every 15 minutes: send what is ready (if automatic) and re-ask about pending ones. */
export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal.finance.payouts.recheckSending, {});
    await ctx.runAction(internal.finance.payouts.sendReady, {});
  },
});

/** The admin types the code Monnify emailed. */
export const authorize = internalAction({
  args: { actorId: v.id("users"), payoutId: v.id("finPayouts"), code: v.string() },
  handler: async (ctx, args) => {
    const cfg = getMonnifyConfig();
    if (!cfg) throw new ConvexError("Monnify is not connected yet");
    const p = await ctx.runQuery(internal.finance.payouts.one, { payoutId: args.payoutId });
    if (!p || p.status !== "needs_code" || !p.reference) throw new ConvexError("This payment is not waiting for a code");
    const code = args.code.replace(/\D/g, "");
    if (!code) throw new ConvexError("Type the code from the Monnify email");
    const token = await monnifyToken(cfg);
    const result = await authorizeTransfer(cfg, token, p.reference, code);
    await ctx.runMutation(internal.finance.payouts.settle, { payoutId: args.payoutId, result: plain(result) });
    await ctx.runMutation(internal.finance.payouts.logAuthorized, { actorId: args.actorId, payoutId: args.payoutId });
    return { state: result.state };
  },
});

export const one = internalQuery({
  args: { payoutId: v.id("finPayouts") },
  handler: async (ctx, args) => await ctx.db.get(args.payoutId),
});

export const logAuthorized = internalMutation({
  args: { actorId: v.id("users"), payoutId: v.id("finPayouts") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (p) await audit(ctx, args.actorId, "payout.authorized", "finPayout", p._id, `Entered the Monnify code for ${naira(p.amountKobo)} to ${p.toName}`);
  },
});

/** Tries a failed payout again, to whatever account is on file now. */
export const retry = internalMutation({
  args: { actorId: v.id("users"), payoutId: v.id("finPayouts") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (!p) fail("Payout not found");
    if (p.status !== "failed") fail("Only a failed payout can be tried again");
    const branch = await ctx.db.get(p.branchId);
    const payment = await ctx.db.get(p.paymentId);
    if (!branch || !payment) fail("The payment for this payout is gone");
    const dest = await destinationFor(ctx, branch, p.share, payment.partnerId, await getSettings(ctx));
    if ("keep" in dest) {
      await ctx.db.delete(p._id);
      await audit(ctx, args.actorId, "payout.kept", "finPayout", p._id, `${naira(p.amountKobo)} ${SHARE_LABEL[p.share]} share now stays in Head Office's account`);
      return;
    }
    // A new attempt gets a new reference; the failed one is finished at Monnify.
    await ctx.db.patch(p._id, { ...destinationPatch(dest), reference: undefined, error: undefined, updatedAt: Date.now() });
    await audit(ctx, args.actorId, "payout.retried", "finPayout", p._id, `Trying again: ${naira(p.amountKobo)} ${SHARE_LABEL[p.share]} share`);
    await scheduleSend(ctx);
  },
});

// ------------------------------------------------------------- screens

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const byStatus = async (status: Doc<"finPayouts">["status"]) =>
      await ctx.db
        .query("finPayouts")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    const [waiting, ready, sending, needsCode, failed] = await Promise.all([
      byStatus("waiting"),
      byStatus("ready"),
      byStatus("sending"),
      byStatus("needs_code"),
      byStatus("failed"),
    ]);
    const recentSent = await ctx.db
      .query("finPayouts")
      .withIndex("by_status", (q) => q.eq("status", "sent"))
      .order("desc")
      .take(30);
    const branches = await ctx.db.query("finBranches").collect();
    const clients = await ctx.db.query("finClients").collect();
    const settings = await getSettings(ctx);
    const view = async (p: Doc<"finPayouts">) => {
      const payment = await ctx.db.get(p.paymentId);
      return {
        id: p._id,
        share: p.share,
        shareLabel: SHARE_LABEL[p.share],
        amountKobo: p.amountKobo,
        status: p.status,
        toName: p.toName ?? null,
        waitingFor: p.waitingFor ?? null,
        bankName: p.bankName ?? null,
        accountNumber: p.accountNumber ?? null,
        accountName: p.accountName ?? null,
        reference: p.reference ?? null,
        error: p.error ?? null,
        branchName: branches.find((b) => b._id === p.branchId)?.name ?? "",
        clientName: payment ? clients.find((c) => c._id === payment.clientId)?.name ?? "" : "",
        createdAt: p.createdAt,
        sentAt: p.sentAt ?? null,
      };
    };
    const attention = [...failed, ...needsCode, ...waiting, ...sending, ...ready].sort((a, b) => a.createdAt - b.createdAt);
    const { start } = periodRange(periodOf(Date.now()));
    let sentThisMonthKobo = 0;
    for await (const p of ctx.db.query("finPayouts").withIndex("by_status", (q) => q.eq("status", "sent")).order("desc")) {
      // Newest first; anything created long before this month was sent before it too.
      if (p.createdAt < start - 62 * 24 * 60 * 60 * 1000) break;
      if ((p.sentAt ?? 0) >= start) sentThisMonthKobo += p.amountKobo;
    }
    return {
      autoSend: !!settings?.autoSend,
      ready: settings?.walletAccountNumber ? true : false,
      counts: { waiting: waiting.length, ready: ready.length, sending: sending.length, needsCode: needsCode.length, failed: failed.length },
      readyKobo: ready.reduce((s, p) => s + p.amountKobo, 0),
      waitingKobo: waiting.reduce((s, p) => s + p.amountKobo, 0),
      sentThisMonthKobo,
      open: await Promise.all(attention.map(view)),
      sent: await Promise.all(recentSent.map(view)),
    };
  },
});
