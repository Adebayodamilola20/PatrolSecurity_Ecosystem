import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { endOfPeriod, invoiceTotals, isDay, isPeriod } from "../lib/finance";
import { audit, clean, fail, nextNumber, todayWat } from "./shared";

const lineValidator = v.object({ description: v.string(), quantity: v.number(), unitKobo: v.number() });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** The status an invoice should have for the amount paid against it. */
export function statusAfterPayment(inv: Pick<Doc<"finInvoices">, "status" | "totalKobo">, paidKobo: number): Doc<"finInvoices">["status"] {
  if (inv.status === "cancelled") return "cancelled";
  if (paidKobo >= inv.totalKobo) return "paid";
  if (paidKobo > 0) return "part_paid";
  return inv.status === "draft" ? "draft" : "sent";
}

function view(i: Doc<"finInvoices">, client?: Doc<"finClients"> | null, branch?: Doc<"finBranches"> | null) {
  const open = i.status === "sent" || i.status === "part_paid";
  return {
    id: i._id,
    number: i.number,
    clientId: i.clientId,
    clientName: client?.name ?? "",
    branchName: branch?.name ?? "",
    period: i.period,
    periodLabel: periodLabel(i.period),
    lines: i.lines,
    subtotalKobo: i.subtotalKobo,
    vatKobo: i.vatKobo,
    totalKobo: i.totalKobo,
    paidKobo: i.paidKobo,
    balanceKobo: i.status === "cancelled" ? 0 : Math.max(0, i.totalKobo - i.paidKobo),
    status: i.status,
    overdue: open && i.dueDate < todayWat(),
    dueDate: i.dueDate,
    notes: i.notes ?? null,
    createdAt: i.createdAt,
  };
}

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const invoices = await ctx.db.query("finInvoices").collect();
    const clients = await ctx.db.query("finClients").collect();
    const branches = await ctx.db.query("finBranches").collect();
    return invoices
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((i) => view(i, clients.find((c) => c._id === i.clientId), branches.find((b) => b._id === i.branchId)));
  },
});

/** Everything needed to print the invoice, including where to pay. */
export const get = internalQuery({
  args: { invoiceId: v.id("finInvoices") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) return null;
    const client = await ctx.db.get(inv.clientId);
    const branch = await ctx.db.get(inv.branchId);
    return {
      ...view(inv, client, branch),
      client: client && {
        name: client.name,
        contactName: client.contactName ?? null,
        address: client.address ?? null,
        phone: client.phone ?? null,
        email: client.email ?? null,
        payBankName: client.payBankName ?? null,
        payAccountNumber: client.payAccountNumber ?? null,
        payAccountName: client.payAccountName ?? null,
      },
    };
  },
});

function checkLines(lines: { description: string; quantity: number; unitKobo: number }[]) {
  if (!lines.length) fail("An invoice needs at least one line");
  if (lines.length > 50) fail("Too many lines on one invoice");
  return lines.map((l) => ({
    description: (clean(l.description, 200) ?? fail("Each line needs a description")) as string,
    quantity: l.quantity,
    unitKobo: l.unitKobo,
  }));
}

async function insertInvoice(
  ctx: MutationCtx,
  actorId: Id<"users">,
  client: Doc<"finClients">,
  period: string,
  lines: { description: string; quantity: number; unitKobo: number }[],
  dueDate: string,
  notes?: string,
) {
  const totals = invoiceTotals(lines);
  const year = period.slice(0, 4);
  const seq = await nextNumber(ctx, `invoice-${year}`);
  const number = `TSL-${year}-${String(seq).padStart(4, "0")}`;
  const id = await ctx.db.insert("finInvoices", {
    number,
    clientId: client._id,
    branchId: client.branchId,
    period,
    lines,
    subtotalKobo: totals.subtotal,
    vatKobo: totals.vat,
    totalKobo: totals.total,
    paidKobo: 0,
    status: "draft",
    dueDate,
    notes,
    createdBy: actorId,
    createdAt: Date.now(),
  });
  await audit(ctx, actorId, "invoice.created", "finInvoice", id, `Created invoice ${number} for ${client.name} (${periodLabel(period)})`);
  return { id, number };
}

export const create = internalMutation({
  args: {
    actorId: v.id("users"),
    clientId: v.id("finClients"),
    period: v.string(),
    lines: v.optional(v.array(lineValidator)),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isPeriod(args.period)) fail("Choose the month this invoice is for");
    const client = await ctx.db.get(args.clientId);
    if (!client) fail("Client not found");
    const dueDate = clean(args.dueDate, 10) ?? endOfPeriod(args.period);
    if (!isDay(dueDate)) fail("Due date is not a real date");
    const lines = args.lines?.length
      ? checkLines(args.lines)
      : [{ description: `Security services — ${periodLabel(args.period)}`, quantity: 1, unitKobo: client.monthlyFeeKobo }];
    return await insertInvoice(ctx, args.actorId, client, args.period, lines, dueDate, clean(args.notes, 500));
  },
});

/** Bills every active client that has no invoice for the month yet. */
export const createMonthly = internalMutation({
  args: { actorId: v.id("users"), period: v.string() },
  handler: async (ctx, args) => {
    if (!isPeriod(args.period)) fail("Choose a month");
    const clients = (await ctx.db.query("finClients").collect()).filter((c) => c.status === "active" && c.monthlyFeeKobo > 0);
    const existing = await ctx.db
      .query("finInvoices")
      .withIndex("by_period", (q) => q.eq("period", args.period))
      .collect();
    let created = 0;
    for (const client of clients) {
      if (existing.some((i) => i.clientId === client._id && i.status !== "cancelled")) continue;
      await insertInvoice(
        ctx,
        args.actorId,
        client,
        args.period,
        [{ description: `Security services — ${periodLabel(args.period)}`, quantity: 1, unitKobo: client.monthlyFeeKobo }],
        endOfPeriod(args.period),
      );
      created++;
    }
    return { created, skipped: clients.length - created };
  },
});

export const update = internalMutation({
  args: {
    actorId: v.id("users"),
    invoiceId: v.id("finInvoices"),
    lines: v.array(lineValidator),
    dueDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) fail("Invoice not found");
    if (inv.status === "cancelled") fail("A cancelled invoice cannot be changed");
    if (inv.status === "paid") fail("A paid invoice cannot be changed");
    if (!isDay(args.dueDate)) fail("Due date is not a real date");
    const lines = checkLines(args.lines);
    const totals = invoiceTotals(lines);
    if (totals.total < inv.paidKobo) fail("The new total is less than what the client has already paid");
    await ctx.db.patch(inv._id, {
      lines,
      subtotalKobo: totals.subtotal,
      vatKobo: totals.vat,
      totalKobo: totals.total,
      dueDate: args.dueDate,
      notes: clean(args.notes, 500),
      status: statusAfterPayment({ status: inv.status, totalKobo: totals.total }, inv.paidKobo),
    });
    await audit(ctx, args.actorId, "invoice.updated", "finInvoice", inv._id, `Edited invoice ${inv.number}`);
  },
});

export const markSent = internalMutation({
  args: { actorId: v.id("users"), invoiceId: v.id("finInvoices") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) fail("Invoice not found");
    if (inv.status !== "draft") fail("Only a draft invoice can be marked as sent");
    await ctx.db.patch(inv._id, { status: "sent", sentAt: Date.now() });
    await audit(ctx, args.actorId, "invoice.sent", "finInvoice", inv._id, `Marked invoice ${inv.number} as sent`);
  },
});

export const cancel = internalMutation({
  args: { actorId: v.id("users"), invoiceId: v.id("finInvoices") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) fail("Invoice not found");
    if (inv.paidKobo > 0) fail("This invoice already has payments against it, so it cannot be cancelled");
    if (inv.status === "cancelled") return;
    await ctx.db.patch(inv._id, { status: "cancelled" });
    await audit(ctx, args.actorId, "invoice.cancelled", "finInvoice", inv._id, `Cancelled invoice ${inv.number}`);
  },
});
