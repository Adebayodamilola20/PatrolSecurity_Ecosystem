import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { addSplits, assertKobo, isPeriod, splitPayment, ZERO_SPLIT } from "../lib/finance";
import { assertSecondPerson, audit, clean, fail, getBranch, nextNumber, periodOf, periodRange } from "./shared";
import { statusAfterPayment } from "./invoices";

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/**
 * Records one payment from a client: pays their oldest open invoices first,
 * shares it by the branch's rule (or holds it while the branch is on hold),
 * and logs it. Safe to call twice with the same reference — the second call
 * changes nothing, which is what makes provider webhooks safe to retry.
 */
export async function applyPayment(
  ctx: MutationCtx,
  args: {
    clientId: Id<"finClients">;
    amountKobo: number;
    receivedAt: number;
    reference: string;
    source: "manual" | "monnify";
    method?: string;
    note?: string;
    recordedBy?: Id<"users">;
  },
): Promise<{ paymentId: Id<"finPayments">; duplicate: boolean }> {
  assertKobo(args.amountKobo);
  if (args.amountKobo <= 0) fail("Payment amount must be more than zero");
  const reference = args.reference.trim();
  if (!reference) fail("Payment reference is required");
  const existing = await ctx.db
    .query("finPayments")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .first();
  if (existing) return { paymentId: existing._id, duplicate: true };

  const client = await ctx.db.get(args.clientId);
  if (!client) fail("Client not found");
  const branch = await getBranch(ctx, client.branchId);

  // Oldest unpaid invoice first.
  const open = (await ctx.db
    .query("finInvoices")
    .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
    .collect())
    .filter((i) => i.status === "draft" || i.status === "sent" || i.status === "part_paid")
    .sort((a, b) => a.period.localeCompare(b.period) || a.createdAt - b.createdAt);
  let remaining = args.amountKobo;
  const allocations: { invoiceId: Id<"finInvoices">; amountKobo: number }[] = [];
  for (const inv of open) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, inv.totalKobo - inv.paidKobo);
    if (take <= 0) continue;
    const paid = inv.paidKobo + take;
    await ctx.db.patch(inv._id, { paidKobo: paid, status: statusAfterPayment(inv, paid) });
    allocations.push({ invoiceId: inv._id, amountKobo: take });
    remaining -= take;
  }

  const partner = branch.partnerId ? await ctx.db.get(branch.partnerId) : null;
  const paymentId = await ctx.db.insert("finPayments", {
    clientId: client._id,
    branchId: branch._id,
    amountKobo: args.amountKobo,
    receivedAt: args.receivedAt,
    reference,
    source: args.source,
    method: clean(args.method, 40),
    note: clean(args.note, 300),
    allocations,
    unallocatedKobo: remaining,
    state: branch.onHold ? "held" : "shared",
    split: splitPayment(args.amountKobo, branch.splitBps),
    splitBps: branch.splitBps,
    partnerId: partner?.status === "active" ? partner._id : undefined,
    recordedBy: args.recordedBy,
    createdAt: Date.now(),
  });
  await audit(
    ctx,
    args.recordedBy ?? "monnify",
    "payment.recorded",
    "finPayment",
    paymentId,
    `Recorded ${naira(args.amountKobo)} from ${client.name}${branch.onHold ? " (branch on hold — not shared yet)" : ""}`,
  );
  return { paymentId, duplicate: false };
}

export const record = internalMutation({
  args: {
    actorId: v.id("users"),
    clientId: v.id("finClients"),
    amountKobo: v.number(),
    receivedAt: v.number(),
    method: v.optional(v.string()),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.receivedAt > Date.now() + 5 * 60 * 1000) fail("The payment date cannot be in the future");
    // Our own running number when the bank reference is not typed in: never clashes.
    const reference = clean(args.reference, 80) ?? `TSL-PAY-${String(await nextNumber(ctx, "manual-payment")).padStart(6, "0")}`;
    const result = await applyPayment(ctx, {
      clientId: args.clientId,
      amountKobo: args.amountKobo,
      receivedAt: args.receivedAt,
      reference,
      source: "manual",
      method: args.method,
      note: args.note,
      recordedBy: args.actorId,
    });
    if (result.duplicate) fail(`A payment with reference ${reference} is already recorded`);
    return result.paymentId;
  },
});

/** Shares a held payment, using the branch's current partner. */
export const release = internalMutation({
  args: { actorId: v.id("users"), paymentId: v.id("finPayments") },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) fail("Payment not found");
    if (payment.state !== "held") fail("This payment is not on hold");
    await assertSecondPerson(ctx, payment.recordedBy, args.actorId);
    const branch = await getBranch(ctx, payment.branchId);
    const partner = branch.partnerId ? await ctx.db.get(branch.partnerId) : null;
    await ctx.db.patch(payment._id, {
      state: "shared",
      releasedBy: args.actorId,
      releasedAt: Date.now(),
      partnerId: partner?.status === "active" ? partner._id : undefined,
    });
    const client = await ctx.db.get(payment.clientId);
    await audit(ctx, args.actorId, "payment.released", "finPayment", payment._id, `Released ${naira(payment.amountKobo)} from ${client?.name ?? "client"} for sharing`);
  },
});

/** Undo a payment typed in by mistake. Payments from Monnify cannot be undone here. */
export const undoManual = internalMutation({
  args: { actorId: v.id("users"), paymentId: v.id("finPayments") },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) fail("Payment not found");
    if (payment.source !== "manual") fail("Payments received through the bank cannot be undone here");
    for (const a of payment.allocations) {
      const inv = await ctx.db.get(a.invoiceId);
      if (!inv) continue;
      const paid = Math.max(0, inv.paidKobo - a.amountKobo);
      await ctx.db.patch(inv._id, { paidKobo: paid, status: statusAfterPayment(inv, paid) });
    }
    await ctx.db.delete(payment._id);
    const client = await ctx.db.get(payment.clientId);
    await audit(ctx, args.actorId, "payment.undone", "finPayment", payment._id, `Undid ${naira(payment.amountKobo)} from ${client?.name ?? "client"} (ref ${payment.reference})`);
  },
});

function view(
  p: Doc<"finPayments">,
  clients: Doc<"finClients">[],
  branches: Doc<"finBranches">[],
  partners: Doc<"finPartners">[],
) {
  return {
    id: p._id,
    clientId: p.clientId,
    clientName: clients.find((c) => c._id === p.clientId)?.name ?? "",
    branchId: p.branchId,
    branchName: branches.find((b) => b._id === p.branchId)?.name ?? "",
    amountKobo: p.amountKobo,
    receivedAt: p.receivedAt,
    reference: p.reference,
    source: p.source,
    method: p.method ?? null,
    note: p.note ?? null,
    state: p.state,
    split: p.split,
    partnerName: p.partnerId ? partners.find((x) => x._id === p.partnerId)?.name ?? null : null,
    unallocatedKobo: p.unallocatedKobo,
  };
}

export const list = internalQuery({
  args: { period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const period = args.period && isPeriod(args.period) ? args.period : periodOf(Date.now());
    const { start, end } = periodRange(period);
    const inMonth = await ctx.db
      .query("finPayments")
      .withIndex("by_receivedAt", (q) => q.gte("receivedAt", start).lt("receivedAt", end))
      .collect();
    // Held money stays on screen until released, whatever month it came in.
    const held = await ctx.db.query("finPayments").withIndex("by_state", (q) => q.eq("state", "held")).collect();
    const clients = await ctx.db.query("finClients").collect();
    const branches = await ctx.db.query("finBranches").collect();
    const partners = await ctx.db.query("finPartners").collect();
    const shared = inMonth.filter((p) => p.state === "shared");
    return {
      period,
      payments: inMonth.sort((a, b) => b.receivedAt - a.receivedAt).map((p) => view(p, clients, branches, partners)),
      held: held.sort((a, b) => a.receivedAt - b.receivedAt).map((p) => view(p, clients, branches, partners)),
      receivedKobo: inMonth.reduce((s, p) => s + p.amountKobo, 0),
      sharedSplit: shared.reduce((s, p) => addSplits(s, p.split), ZERO_SPLIT),
    };
  },
});
