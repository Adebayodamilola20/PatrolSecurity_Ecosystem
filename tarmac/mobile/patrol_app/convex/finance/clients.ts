import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { assertKobo, cleanAccountNumber, isDay } from "../lib/finance";
import { audit, clean, fail, getBranch, required } from "./shared";

function owed(invoices: Doc<"finInvoices">[]) {
  return invoices
    .filter((i) => i.status === "sent" || i.status === "part_paid")
    .reduce((s, i) => s + i.totalKobo - i.paidKobo, 0);
}

function view(c: Doc<"finClients">, branchName: string, invoices: Doc<"finInvoices">[]) {
  return {
    id: c._id,
    name: c.name,
    branchId: c.branchId,
    branchName,
    contactName: c.contactName ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    address: c.address ?? null,
    monthlyFeeKobo: c.monthlyFeeKobo,
    guards: c.guards,
    contractEnd: c.contractEnd ?? null,
    status: c.status,
    payBankName: c.payBankName ?? null,
    payAccountNumber: c.payAccountNumber ?? null,
    payAccountName: c.payAccountName ?? null,
    payProvider: c.payProvider ?? null,
    owedKobo: owed(invoices.filter((i) => i.clientId === c._id)),
  };
}

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query("finClients").collect();
    const branches = await ctx.db.query("finBranches").collect();
    const invoices = await ctx.db.query("finInvoices").collect();
    return clients
      .sort((a, b) => Number(a.status === "ended") - Number(b.status === "ended") || a.name.localeCompare(b.name))
      .map((c) => view(c, branches.find((b) => b._id === c.branchId)?.name ?? "", invoices));
  },
});

export const get = internalQuery({
  args: { clientId: v.id("finClients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return null;
    const branch = await ctx.db.get(client.branchId);
    const invoices = await ctx.db
      .query("finInvoices")
      .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
      .collect();
    const payments = await ctx.db
      .query("finPayments")
      .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
      .collect();
    return {
      ...view(client, branch?.name ?? "", invoices),
      invoices: invoices
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((i) => ({ id: i._id, number: i.number, period: i.period, totalKobo: i.totalKobo, paidKobo: i.paidKobo, status: i.status, dueDate: i.dueDate })),
      payments: payments
        .sort((a, b) => b.receivedAt - a.receivedAt)
        .map((p) => ({ id: p._id, amountKobo: p.amountKobo, receivedAt: p.receivedAt, reference: p.reference, state: p.state })),
    };
  },
});

const fields = {
  name: v.string(),
  branchId: v.id("finBranches"),
  contactName: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  monthlyFeeKobo: v.number(),
  guards: v.number(),
  contractEnd: v.optional(v.string()),
};

function checked(args: {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  monthlyFeeKobo: number;
  guards: number;
  contractEnd?: string;
}) {
  assertKobo(args.monthlyFeeKobo, "Monthly fee");
  if (args.monthlyFeeKobo < 0) fail("Monthly fee cannot be negative");
  if (!Number.isInteger(args.guards) || args.guards < 0) fail("Number of guards must be a whole number");
  const contractEnd = clean(args.contractEnd, 10);
  if (contractEnd && !isDay(contractEnd)) fail("Contract end date is not a real date");
  return {
    name: required(args.name, "Client name", 120),
    contactName: clean(args.contactName, 80),
    phone: clean(args.phone, 30),
    email: clean(args.email, 120),
    address: clean(args.address, 200),
    monthlyFeeKobo: args.monthlyFeeKobo,
    guards: args.guards,
    contractEnd,
  };
}

export const create = internalMutation({
  args: { actorId: v.id("users"), ...fields },
  handler: async (ctx, args) => {
    const branch = await getBranch(ctx, args.branchId);
    const data = checked(args);
    const id = await ctx.db.insert("finClients", { ...data, branchId: branch._id, status: "active", createdAt: Date.now() });
    await audit(ctx, args.actorId, "client.created", "finClient", id, `Added client ${data.name} (${branch.name})`);
    return id;
  },
});

export const update = internalMutation({
  args: { actorId: v.id("users"), clientId: v.id("finClients"), ...fields },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) fail("Client not found");
    const branch = await getBranch(ctx, args.branchId);
    const data = checked(args);
    await ctx.db.patch(client._id, { ...data, branchId: branch._id });
    await audit(ctx, args.actorId, "client.updated", "finClient", client._id, `Updated client ${data.name}`);
  },
});

/**
 * The client's own payment account. Normally created through Monnify; this
 * typed-in version is for accounts set up by hand, or before Monnify is live.
 */
export const setPayAccount = internalMutation({
  args: {
    actorId: v.id("users"),
    clientId: v.id("finClients"),
    bankName: v.string(),
    accountNumber: v.string(),
    accountName: v.optional(v.string()),
    accountRef: v.optional(v.string()),
    provider: v.union(v.literal("monnify"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) fail("Client not found");
    const accountNumber = cleanAccountNumber(args.accountNumber);
    const clash = await ctx.db
      .query("finClients")
      .withIndex("by_payAccountNumber", (q) => q.eq("payAccountNumber", accountNumber))
      .first();
    if (clash && clash._id !== client._id) fail(`That account number already belongs to ${clash.name}`);
    await ctx.db.patch(client._id, {
      payBankName: required(args.bankName, "Bank", 80),
      payAccountNumber: accountNumber,
      payAccountName: clean(args.accountName, 120) ?? client.name,
      payAccountRef: clean(args.accountRef, 80),
      payProvider: args.provider,
    });
    await audit(ctx, args.actorId, "client.account_set", "finClient", client._id, `Set ${client.name}'s payment account to ${args.bankName} ${accountNumber}`);
  },
});

export const setStatus = internalMutation({
  args: { actorId: v.id("users"), clientId: v.id("finClients"), status: v.union(v.literal("active"), v.literal("ended")) },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) fail("Client not found");
    await ctx.db.patch(client._id, { status: args.status });
    await audit(ctx, args.actorId, args.status === "ended" ? "client.ended" : "client.reactivated", "finClient", client._id, `${client.name}: contract ${args.status === "ended" ? "ended" : "active again"}`);
  },
});
