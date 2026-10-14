import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { addSplits, isPeriod, ZERO_SPLIT } from "../lib/finance";
import { periodOf, periodRange, todayWat } from "./shared";
import { periodLabel } from "./invoices";

const DAY = 24 * 60 * 60 * 1000;
const daysLate = (due: string, today: string) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / DAY);

/** The home screen: a few numbers and a short list of things to do. */
export const overview = internalQuery({
  args: {},
  handler: async (ctx) => {
    const period = periodOf(Date.now());
    const today = todayWat();
    const { start, end } = periodRange(period);
    const branches = (await ctx.db.query("finBranches").collect()).filter((b) => b.active);
    const clients = await ctx.db.query("finClients").collect();
    const invoices = await ctx.db.query("finInvoices").collect();
    const partners = await ctx.db.query("finPartners").collect();
    const runs = await ctx.db.query("finPayrollRuns").collect();
    const monthPayments = await ctx.db
      .query("finPayments")
      .withIndex("by_receivedAt", (q) => q.gte("receivedAt", start).lt("receivedAt", end))
      .collect();
    const held = await ctx.db.query("finPayments").withIndex("by_state", (q) => q.eq("state", "held")).collect();

    const nameOf = (id: string) => clients.find((c) => c._id === id)?.name ?? "A client";
    const branchName = (id: string) => branches.find((b) => b._id === id)?.name ?? "";
    const open = invoices.filter((i) => i.status === "sent" || i.status === "part_paid");
    const overdue = open.filter((i) => i.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const todo: { kind: string; text: string; detail: string; to: string; urgent: boolean }[] = [];
    if (!branches.length) todo.push({ kind: "setup", text: "Add your branches", detail: "Start here", to: "/finance/branches", urgent: false });
    else if (!clients.length) todo.push({ kind: "setup", text: "Add your first client", detail: "Next step", to: "/finance/clients", urgent: false });
    for (const i of overdue.slice(0, 5)) {
      const late = daysLate(i.dueDate, today);
      todo.push({
        kind: "overdue",
        text: `${nameOf(i.clientId)} has not paid invoice ${i.number}`,
        detail: `${late} day${late === 1 ? "" : "s"} late`,
        to: "/finance/invoices",
        urgent: true,
      });
    }
    if (overdue.length > 5) todo.push({ kind: "overdue", text: `${overdue.length - 5} more unpaid invoices are late`, detail: "", to: "/finance/invoices", urgent: true });
    for (const p of held) {
      todo.push({ kind: "held", text: `Payment from ${nameOf(p.clientId)} is on hold`, detail: branchName(p.branchId), to: "/finance/payments", urgent: false });
    }
    for (const p of partners.filter((x) => x.status === "pending")) {
      todo.push({ kind: "partner", text: `New partner ${p.name} needs approval`, detail: branchName(p.branchId), to: "/finance/branches", urgent: false });
    }
    for (const r of runs.filter((x) => x.status === "draft")) {
      todo.push({ kind: "payroll", text: `${branchName(r.branchId)} payroll for ${periodLabel(r.period)} needs approval`, detail: "", to: "/finance/payroll", urgent: false });
    }
    for (const r of runs.filter((x) => x.status === "approved")) {
      todo.push({ kind: "payroll", text: `${branchName(r.branchId)} payroll for ${periodLabel(r.period)} is approved — pay the staff`, detail: "", to: "/finance/payroll", urgent: false });
    }
    const payouts = async (status: "failed" | "needs_code" | "waiting") =>
      await ctx.db.query("finPayouts").withIndex("by_status", (q) => q.eq("status", status)).collect();
    const failed = await payouts("failed");
    if (failed.length) {
      todo.push({ kind: "payout", text: `${failed.length} payment${failed.length === 1 ? "" : "s"} to banks did not go through`, detail: "Try again", to: "/finance/money-out", urgent: true });
    }
    const needsCode = await payouts("needs_code");
    if (needsCode.length) {
      todo.push({ kind: "payout", text: `Type the Monnify email code to send ${needsCode.length} payment${needsCode.length === 1 ? "" : "s"}`, detail: "", to: "/finance/money-out", urgent: true });
    }
    const waiting = await payouts("waiting");
    if (waiting.length) {
      const first = waiting[0].waitingFor;
      todo.push({ kind: "payout", text: `Money is waiting to be sent — add ${first}`, detail: `${waiting.length} share${waiting.length === 1 ? "" : "s"}`, to: "/finance/money-out", urgent: false });
    }
    const noAccount = clients.filter((c) => c.status === "active" && !c.payAccountNumber);
    if (noAccount.length) {
      todo.push({
        kind: "account",
        text: `${noAccount.length} client${noAccount.length === 1 ? " has" : "s have"} no payment account number yet`,
        detail: "",
        to: "/finance/clients",
        urgent: false,
      });
    }

    return {
      period,
      periodLabel: periodLabel(period),
      receivedKobo: monthPayments.reduce((s, p) => s + p.amountKobo, 0),
      owedKobo: open.reduce((s, i) => s + i.totalKobo - i.paidKobo, 0),
      overdueKobo: overdue.reduce((s, i) => s + i.totalKobo - i.paidKobo, 0),
      heldKobo: held.reduce((s, p) => s + p.amountKobo, 0),
      todo,
      latest: monthPayments
        .sort((a, b) => b.receivedAt - a.receivedAt)
        .slice(0, 5)
        .map((p) => ({ id: p._id, clientName: nameOf(p.clientId), amountKobo: p.amountKobo, receivedAt: p.receivedAt, state: p.state })),
      counts: { branches: branches.length, clients: clients.filter((c) => c.status === "active").length },
      check: await (async () => {
        const c = await ctx.db.query("finChecks").withIndex("by_ranAt").order("desc").first();
        return c ? { day: c.day, ranAt: c.ranAt, ok: c.ok, lines: c.lines, recovered: c.recovered } : null;
      })(),
    };
  },
});

/** Figures behind the downloadable reports for one month. */
export const reports = internalQuery({
  args: { period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const period = args.period && isPeriod(args.period) ? args.period : periodOf(Date.now());
    const today = todayWat();
    const { start, end } = periodRange(period);
    const branches = (await ctx.db.query("finBranches").collect())
      .filter((b) => b.active)
      .sort((a, b) => Number(b.isHq) - Number(a.isHq) || a.name.localeCompare(b.name));
    const clients = await ctx.db.query("finClients").collect();
    const invoices = await ctx.db.query("finInvoices").collect();
    const runs = (await ctx.db.query("finPayrollRuns").collect()).filter((r) => r.period === period);
    const payments = await ctx.db
      .query("finPayments")
      .withIndex("by_receivedAt", (q) => q.gte("receivedAt", start).lt("receivedAt", end))
      .collect();

    const byBranch = branches.map((b) => {
      const mine = payments.filter((p) => p.branchId === b._id);
      const shared = mine.filter((p) => p.state === "shared");
      return {
        branchName: b.name,
        payments: mine.length,
        receivedKobo: mine.reduce((s, p) => s + p.amountKobo, 0),
        heldKobo: mine.filter((p) => p.state === "held").reduce((s, p) => s + p.amountKobo, 0),
        split: shared.reduce((s, p) => addSplits(s, p.split), ZERO_SPLIT),
      };
    });

    const owed = invoices
      .filter((i) => i.status === "sent" || i.status === "part_paid")
      .map((i) => ({
        number: i.number,
        clientName: clients.find((c) => c._id === i.clientId)?.name ?? "",
        branchName: branches.find((b) => b._id === i.branchId)?.name ?? "",
        dueDate: i.dueDate,
        balanceKobo: i.totalKobo - i.paidKobo,
        daysLate: Math.max(0, daysLate(i.dueDate, today)),
      }))
      .sort((a, b) => b.daysLate - a.daysLate);

    const payroll = branches.map((b) => {
      const run = runs.find((r) => r.branchId === b._id);
      return {
        branchName: b.name,
        status: run?.status ?? "none",
        people: run?.lines.length ?? 0,
        totals: run?.totals ?? { gross: 0, pension: 0, nhf: 0, paye: 0, net: 0, employerPension: 0, cost: 0 },
      };
    });

    return { period, periodLabel: periodLabel(period), byBranch, owed, payroll };
  },
});
