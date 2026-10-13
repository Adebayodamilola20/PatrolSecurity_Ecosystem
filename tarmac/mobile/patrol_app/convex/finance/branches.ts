import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { DEFAULT_SPLIT_BPS, cleanAccountNumber, validateSplit } from "../lib/finance";
import { assertSecondPerson, audit, clean, fail, getBranch, periodOf, periodRange, required } from "./shared";

const splitValidator = v.object({ hq: v.number(), vat: v.number(), partner: v.number(), salary: v.number() });

/** Tarmac's branches, Head Office first. */
export const TARMAC_BRANCHES = ["Jos", "Abuja", "Lagos", "Port Harcourt", "Owerri", "Yola", "Lafia"];

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const branches = (await ctx.db.query("finBranches").collect()).filter((b) => b.active);
    const partners = await ctx.db.query("finPartners").collect();
    const clients = await ctx.db.query("finClients").collect();
    const staff = await ctx.db.query("finStaff").collect();
    const invoices = await ctx.db.query("finInvoices").collect();
    const { start, end } = periodRange(periodOf(Date.now()));
    const payments = await ctx.db
      .query("finPayments")
      .withIndex("by_receivedAt", (q) => q.gte("receivedAt", start).lt("receivedAt", end))
      .collect();

    return branches
      .sort((a, b) => Number(b.isHq) - Number(a.isHq) || a.name.localeCompare(b.name))
      .map((b) => {
        const partner = b.partnerId ? partners.find((p) => p._id === b.partnerId) : undefined;
        const waiting = partners.find((p) => p.branchId === b._id && p.status === "pending");
        return {
          id: b._id,
          name: b.name,
          isHq: b.isHq,
          onHold: b.onHold,
          holdNote: b.holdNote ?? null,
          splitBps: b.splitBps,
          salaryBankName: b.salaryBankName ?? null,
          salaryAccountNumber: b.salaryAccountNumber ?? null,
          partner: partner && partner.status === "active" ? { id: partner._id, name: partner.name } : null,
          partnerWaiting: waiting ? { id: waiting._id, name: waiting.name } : null,
          clients: clients.filter((c) => c.branchId === b._id && c.status === "active").length,
          staff: staff.filter((s) => s.branchId === b._id && s.status !== "left").length,
          collectedKobo: payments.filter((p) => p.branchId === b._id).reduce((s, p) => s + p.amountKobo, 0),
          owedKobo: invoices
            .filter((i) => i.branchId === b._id && (i.status === "sent" || i.status === "part_paid"))
            .reduce((s, i) => s + i.totalKobo - i.paidKobo, 0),
        };
      });
  },
});

async function nameTaken(ctx: { db: any }, name: string, except?: Id<"finBranches">) {
  const all: Doc<"finBranches">[] = await ctx.db.query("finBranches").collect();
  return all.some((b) => b.active && b._id !== except && b.name.toLowerCase() === name.toLowerCase());
}

export const create = internalMutation({
  args: { actorId: v.id("users"), name: v.string(), isHq: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const name = required(args.name, "Branch name", 60);
    if (await nameTaken(ctx, name)) fail(`There is already a ${name} branch`);
    if (args.isHq) {
      const hq = (await ctx.db.query("finBranches").collect()).find((b) => b.active && b.isHq);
      if (hq) fail(`${hq.name} is already the Head Office branch`);
    }
    const id = await ctx.db.insert("finBranches", {
      name,
      isHq: !!args.isHq,
      splitBps: DEFAULT_SPLIT_BPS,
      onHold: false,
      active: true,
      createdAt: Date.now(),
    });
    await audit(ctx, args.actorId, "branch.created", "finBranch", id, `Added branch ${name}`);
    return id;
  },
});

/** One click on an empty system: Tarmac's 7 branches, Jos as Head Office. */
export const addTarmacBranches = internalMutation({
  args: { actorId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = (await ctx.db.query("finBranches").collect()).filter((b) => b.active);
    if (existing.length) fail("Branches already exist. Add any missing branch one at a time.");
    for (const [i, name] of TARMAC_BRANCHES.entries()) {
      await ctx.db.insert("finBranches", {
        name,
        isHq: i === 0,
        splitBps: DEFAULT_SPLIT_BPS,
        onHold: false,
        active: true,
        createdAt: Date.now(),
      });
    }
    await audit(ctx, args.actorId, "branch.created", "finBranch", "all", `Added Tarmac's ${TARMAC_BRANCHES.length} branches`);
    return TARMAC_BRANCHES.length;
  },
});

export const update = internalMutation({
  args: {
    actorId: v.id("users"),
    branchId: v.id("finBranches"),
    name: v.optional(v.string()),
    salaryBankName: v.optional(v.string()),
    salaryAccountNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const branch = await getBranch(ctx, args.branchId);
    const patch: Partial<Doc<"finBranches">> = {};
    if (args.name !== undefined) {
      const name = required(args.name, "Branch name", 60);
      if (await nameTaken(ctx, name, branch._id)) fail(`There is already a ${name} branch`);
      patch.name = name;
    }
    if (args.salaryBankName !== undefined) patch.salaryBankName = clean(args.salaryBankName, 80);
    if (args.salaryAccountNumber !== undefined) {
      patch.salaryAccountNumber = args.salaryAccountNumber.trim() ? cleanAccountNumber(args.salaryAccountNumber) : undefined;
    }
    await ctx.db.patch(branch._id, patch);
    await audit(ctx, args.actorId, "branch.updated", "finBranch", branch._id, `Updated branch ${patch.name ?? branch.name}`);
  },
});

/** While a branch is on hold, its payments are recorded but not shared. */
export const setHold = internalMutation({
  args: { actorId: v.id("users"), branchId: v.id("finBranches"), onHold: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const branch = await getBranch(ctx, args.branchId);
    await ctx.db.patch(branch._id, { onHold: args.onHold, holdNote: args.onHold ? clean(args.note, 200) : undefined });
    await audit(
      ctx,
      args.actorId,
      args.onHold ? "branch.held" : "branch.unheld",
      "finBranch",
      branch._id,
      args.onHold ? `Put ${branch.name} on hold${args.note ? `: ${args.note}` : ""}` : `Took ${branch.name} off hold`,
    );
  },
});

export const setSplit = internalMutation({
  args: { actorId: v.id("users"), branchId: v.id("finBranches"), splitBps: splitValidator },
  handler: async (ctx, args) => {
    validateSplit(args.splitBps);
    const branch = await getBranch(ctx, args.branchId);
    const pct = (n: number) => `${n / 100}%`;
    await ctx.db.patch(branch._id, { splitBps: args.splitBps });
    await audit(
      ctx,
      args.actorId,
      "branch.split_changed",
      "finBranch",
      branch._id,
      `${branch.name} sharing changed from HQ ${pct(branch.splitBps.hq)} / VAT ${pct(branch.splitBps.vat)} / partner ${pct(branch.splitBps.partner)} / salaries ${pct(branch.splitBps.salary)} to HQ ${pct(args.splitBps.hq)} / VAT ${pct(args.splitBps.vat)} / partner ${pct(args.splitBps.partner)} / salaries ${pct(args.splitBps.salary)}`,
    );
  },
});

// ---------------------------------------------------------------- partners

export const listPartners = internalQuery({
  args: {},
  handler: async (ctx) => {
    const partners = (await ctx.db.query("finPartners").collect()).filter((p) => p.status !== "removed");
    const branches = await ctx.db.query("finBranches").collect();
    const { start, end } = periodRange(periodOf(Date.now()));
    const payments = await ctx.db
      .query("finPayments")
      .withIndex("by_receivedAt", (q) => q.gte("receivedAt", start).lt("receivedAt", end))
      .collect();
    return partners
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        id: p._id,
        name: p.name,
        phone: p.phone,
        email: p.email ?? null,
        branchId: p.branchId,
        branchName: branches.find((b) => b._id === p.branchId)?.name ?? "",
        bankName: p.bankName,
        accountNumber: p.accountNumber,
        accountName: p.accountName,
        status: p.status,
        createdAt: p.createdAt,
        paidThisMonthKobo: payments
          .filter((x) => x.partnerId === p._id && x.state === "shared")
          .reduce((s, x) => s + x.split.partner, 0),
      }));
  },
});

const partnerFields = {
  name: v.string(),
  phone: v.string(),
  email: v.optional(v.string()),
  bankName: v.string(),
  accountNumber: v.string(),
  accountName: v.string(),
};

export const createPartner = internalMutation({
  args: { actorId: v.id("users"), branchId: v.id("finBranches"), ...partnerFields },
  handler: async (ctx, args) => {
    const branch = await getBranch(ctx, args.branchId);
    const id = await ctx.db.insert("finPartners", {
      name: required(args.name, "Partner name", 80),
      phone: required(args.phone, "Phone number", 30),
      email: clean(args.email, 120),
      branchId: branch._id,
      bankName: required(args.bankName, "Bank", 80),
      accountNumber: cleanAccountNumber(args.accountNumber),
      accountName: required(args.accountName, "Account name", 120),
      status: "pending",
      createdBy: args.actorId,
      createdAt: Date.now(),
    });
    await audit(ctx, args.actorId, "partner.created", "finPartner", id, `Added ${args.name.trim()} as partner for ${branch.name} (waiting for approval)`);
    return id;
  },
});

export const approvePartner = internalMutation({
  args: { actorId: v.id("users"), partnerId: v.id("finPartners") },
  handler: async (ctx, args) => {
    const partner = await ctx.db.get(args.partnerId);
    if (!partner || partner.status === "removed") fail("Partner not found");
    if (partner.status === "active") fail(`${partner.name} is already approved`);
    await assertSecondPerson(ctx, partner.createdBy, args.actorId);
    const branch = await getBranch(ctx, partner.branchId);
    // One partner per branch: approving a new one retires the old one.
    if (branch.partnerId && branch.partnerId !== partner._id) {
      const previous = await ctx.db.get(branch.partnerId);
      if (previous && previous.status !== "removed") await ctx.db.patch(previous._id, { status: "removed" });
    }
    await ctx.db.patch(partner._id, { status: "active", approvedBy: args.actorId, approvedAt: Date.now() });
    await ctx.db.patch(branch._id, { partnerId: partner._id });
    await audit(ctx, args.actorId, "partner.approved", "finPartner", partner._id, `Approved ${partner.name} as ${branch.name} partner`);
  },
});

export const updatePartner = internalMutation({
  args: { actorId: v.id("users"), partnerId: v.id("finPartners"), ...partnerFields },
  handler: async (ctx, args) => {
    const partner = await ctx.db.get(args.partnerId);
    if (!partner || partner.status === "removed") fail("Partner not found");
    const accountNumber = cleanAccountNumber(args.accountNumber);
    const bankChanged = accountNumber !== partner.accountNumber || args.bankName.trim() !== partner.bankName;
    await ctx.db.patch(partner._id, {
      name: required(args.name, "Partner name", 80),
      phone: required(args.phone, "Phone number", 30),
      email: clean(args.email, 120),
      bankName: required(args.bankName, "Bank", 80),
      accountNumber,
      accountName: required(args.accountName, "Account name", 120),
      // A new bank account must be approved again before money goes to it.
      ...(bankChanged ? { status: "pending" as const, createdBy: args.actorId, approvedBy: undefined, approvedAt: undefined } : {}),
    });
    if (bankChanged) {
      const branch = await ctx.db.get(partner.branchId);
      if (branch?.partnerId === partner._id) await ctx.db.patch(branch._id, { partnerId: undefined });
    }
    await audit(
      ctx,
      args.actorId,
      bankChanged ? "partner.bank_changed" : "partner.updated",
      "finPartner",
      partner._id,
      bankChanged ? `Changed ${partner.name}'s bank account — needs approval again` : `Updated ${partner.name}`,
    );
  },
});

export const removePartner = internalMutation({
  args: { actorId: v.id("users"), partnerId: v.id("finPartners") },
  handler: async (ctx, args) => {
    const partner = await ctx.db.get(args.partnerId);
    if (!partner || partner.status === "removed") fail("Partner not found");
    await ctx.db.patch(partner._id, { status: "removed" });
    const branch = await ctx.db.get(partner.branchId);
    if (branch?.partnerId === partner._id) await ctx.db.patch(branch._id, { partnerId: undefined });
    await audit(ctx, args.actorId, "partner.removed", "finPartner", partner._id, `Removed ${partner.name} as partner`);
  },
});

