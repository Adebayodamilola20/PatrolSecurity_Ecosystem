import { internalMutation, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { isPeriod, payLine } from "../lib/finance";
import { assertSecondPerson, audit, fail, getBranch } from "./shared";
import { periodLabel } from "./invoices";

type Line = Doc<"finPayrollRuns">["lines"][number];

function linesFor(staff: Doc<"finStaff">[]): Line[] {
  return staff
    // Suspended staff and leavers are not paid; staff on leave are.
    .filter((s) => s.status === "active" || s.status === "leave")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const pay = payLine(s.basicKobo, s.allowancesKobo, { nhf: s.nhf });
      return {
        staffId: s._id,
        name: s.name,
        staffNo: s.staffNo,
        role: s.role,
        bankName: s.bankName,
        accountNumber: s.accountNumber,
        basic: pay.basic,
        allowances: pay.allowances,
        gross: pay.gross,
        pension: pay.pension,
        nhf: pay.nhf,
        paye: pay.paye,
        net: pay.net,
        employerPension: pay.employerPension,
        cost: pay.cost,
      };
    });
}

function totalsOf(lines: Line[]) {
  const sum = (k: keyof Line) => lines.reduce((s, l) => s + (l[k] as number), 0);
  return {
    gross: sum("gross"),
    pension: sum("pension"),
    nhf: sum("nhf"),
    paye: sum("paye"),
    net: sum("net"),
    employerPension: sum("employerPension"),
    cost: sum("cost"),
  };
}

/** Salary share collected for a branch, less payrolls already paid from it. */
async function salaryAvailable(ctx: QueryCtx, branchId: Id<"finBranches">) {
  const payments = await ctx.db
    .query("finPayments")
    .withIndex("by_branchId_receivedAt", (q) => q.eq("branchId", branchId))
    .collect();
  const runs = await ctx.db
    .query("finPayrollRuns")
    .withIndex("by_branchId_period", (q) => q.eq("branchId", branchId))
    .collect();
  const collected = payments.filter((p) => p.state === "shared").reduce((s, p) => s + p.split.salary, 0);
  const paidOut = runs.filter((r) => r.status === "paid").reduce((s, r) => s + r.totals.cost, 0);
  return collected - paidOut;
}

async function findRun(ctx: QueryCtx, branchId: Id<"finBranches">, period: string) {
  return await ctx.db
    .query("finPayrollRuns")
    .withIndex("by_branchId_period", (q) => q.eq("branchId", branchId).eq("period", period))
    .first();
}

export const get = internalQuery({
  args: { branchId: v.id("finBranches"), period: v.string() },
  handler: async (ctx, args) => {
    if (!isPeriod(args.period)) fail("Choose a month");
    const branch = await getBranch(ctx, args.branchId);
    const run = await findRun(ctx, branch._id, args.period);
    const lines = run
      ? run.lines
      : linesFor(await ctx.db.query("finStaff").withIndex("by_branchId", (q) => q.eq("branchId", branch._id)).collect());
    return {
      branchName: branch.name,
      period: args.period,
      periodLabel: periodLabel(args.period),
      runId: run?._id ?? null,
      // "none" = nothing saved yet; the lines are a preview from current staff.
      status: run?.status ?? ("none" as const),
      lines,
      totals: run?.totals ?? totalsOf(lines),
      salaryAvailableKobo: await salaryAvailable(ctx, branch._id),
      missingBank: lines.filter((l) => !l.accountNumber).map((l) => l.name),
      salaryBankName: branch.salaryBankName ?? null,
      salaryAccountNumber: branch.salaryAccountNumber ?? null,
    };
  },
});

/** Creates (or refreshes) the draft payroll from current staff and pay. */
export const generate = internalMutation({
  args: { actorId: v.id("users"), branchId: v.id("finBranches"), period: v.string() },
  handler: async (ctx, args) => {
    if (!isPeriod(args.period)) fail("Choose a month");
    const branch = await getBranch(ctx, args.branchId);
    const existing = await findRun(ctx, branch._id, args.period);
    if (existing && existing.status !== "draft") fail(`${branch.name} payroll for ${periodLabel(args.period)} is already ${existing.status}`);
    const staff = await ctx.db.query("finStaff").withIndex("by_branchId", (q) => q.eq("branchId", branch._id)).collect();
    const lines = linesFor(staff);
    if (!lines.length) fail(`${branch.name} has no active staff to pay`);
    const totals = totalsOf(lines);
    let runId: Id<"finPayrollRuns">;
    if (existing) {
      await ctx.db.patch(existing._id, { lines, totals, createdBy: args.actorId, createdAt: Date.now() });
      runId = existing._id;
    } else {
      runId = await ctx.db.insert("finPayrollRuns", {
        branchId: branch._id,
        period: args.period,
        status: "draft",
        lines,
        totals,
        createdBy: args.actorId,
        createdAt: Date.now(),
      });
    }
    await audit(ctx, args.actorId, "payroll.drafted", "finPayrollRun", runId, `${existing ? "Refreshed" : "Prepared"} ${branch.name} payroll for ${periodLabel(args.period)} (${lines.length} people)`);
    return runId;
  },
});

export const approve = internalMutation({
  args: { actorId: v.id("users"), runId: v.id("finPayrollRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) fail("Payroll not found");
    if (run.status !== "draft") fail(`This payroll is already ${run.status}`);
    await assertSecondPerson(ctx, run.createdBy, args.actorId);
    const missing = run.lines.filter((l) => !l.accountNumber);
    if (missing.length) fail(`Add bank details for ${missing.map((l) => l.name).join(", ")} before approving`);
    await ctx.db.patch(run._id, { status: "approved", approvedBy: args.actorId, approvedAt: Date.now() });
    const branch = await ctx.db.get(run.branchId);
    await audit(ctx, args.actorId, "payroll.approved", "finPayrollRun", run._id, `Approved ${branch?.name ?? ""} payroll for ${periodLabel(run.period)}`);
  },
});

export const markPaid = internalMutation({
  args: { actorId: v.id("users"), runId: v.id("finPayrollRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) fail("Payroll not found");
    if (run.status !== "approved") fail("Approve the payroll before marking it paid");
    await ctx.db.patch(run._id, { status: "paid", paidBy: args.actorId, paidAt: Date.now() });
    const branch = await ctx.db.get(run.branchId);
    await audit(ctx, args.actorId, "payroll.paid", "finPayrollRun", run._id, `Marked ${branch?.name ?? ""} payroll for ${periodLabel(run.period)} as paid`);
  },
});
