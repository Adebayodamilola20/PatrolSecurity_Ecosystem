/// <reference types="vite/client" />
/**
 * Finance package: every action must leave the right record in the database.
 * Runs against convex-test's in-memory backend — never a real deployment.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");
const N = (naira: number) => naira * 100;
const f = internal.finance;

async function setup(opts: { admins?: number } = {}) {
  const t = convexTest(schema, modules);
  const admins: Id<"users">[] = await t.run(async (ctx) => {
    const ids: Id<"users">[] = [];
    for (let i = 0; i < (opts.admins ?? 1); i++) {
      ids.push(
        await ctx.db.insert("users", {
          name: `Admin ${i + 1}`,
          email: `admin${i + 1}@tarmac.test`,
          passwordHash: "x",
          role: "admin",
          phone: "",
          active: true,
          liveTracking: false,
          createdAt: Date.now(),
        }),
      );
    }
    return ids;
  });
  await t.mutation(f.branches.addTarmacBranches, { actorId: admins[0] });
  const branches = await t.query(f.branches.list, {});
  const branch = (name: string) => branches.find((b) => b.name === name)!.id;
  return { t, admin: admins[0], admin2: admins[1], branch };
}

async function addClient(s: Awaited<ReturnType<typeof setup>>, name = "Rayfield Estate", fee = 1_000_000, branch = "Jos") {
  return await s.t.mutation(f.clients.create, {
    actorId: s.admin,
    name,
    branchId: s.branch(branch),
    monthlyFeeKobo: N(fee),
    guards: 10,
  });
}

const audits = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).filter((a) => a.action.startsWith("finance.")));

describe("branches", () => {
  test("one click adds Tarmac's 7 branches with Jos as Head Office", async () => {
    const { t, admin } = await setup();
    const branches = await t.query(f.branches.list, {});
    expect(branches.map((b) => b.name)).toEqual(["Jos", "Abuja", "Lafia", "Lagos", "Owerri", "Port Harcourt", "Yola"]);
    expect(branches[0].isHq).toBe(true);
    expect(branches[0].splitBps).toEqual({ hq: 800, vat: 750, partner: 3450, salary: 5000 });
    await expect(t.mutation(f.branches.addTarmacBranches, { actorId: admin })).rejects.toThrow(/already exist/);
    await expect(t.mutation(f.branches.create, { actorId: admin, name: "lagos" })).rejects.toThrow(/already a lagos/i);
  });

  test("sharing rule must add to 100%", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(f.branches.setSplit, { actorId: s.admin, branchId: s.branch("Abuja"), splitBps: { hq: 800, vat: 750, partner: 3450, salary: 4000 } }),
    ).rejects.toThrow(/100%/);
  });
});

describe("partners", () => {
  const partner = { name: "Ibrahim Danladi", phone: "08030000000", bankName: "Zenith Bank", accountNumber: "2081234541", accountName: "Ibrahim Danladi" };

  test("new partner waits for approval; a second admin approves", async () => {
    const s = await setup({ admins: 2 });
    const id = await s.t.mutation(f.branches.createPartner, { actorId: s.admin, branchId: s.branch("Abuja"), ...partner });
    let list = await s.t.query(f.branches.listPartners, {});
    expect(list[0].status).toBe("pending");
    await expect(s.t.mutation(f.branches.approvePartner, { actorId: s.admin, partnerId: id })).rejects.toThrow(/different admin/);
    await s.t.mutation(f.branches.approvePartner, { actorId: s.admin2!, partnerId: id });
    list = await s.t.query(f.branches.listPartners, {});
    expect(list[0].status).toBe("active");
    const abuja = (await s.t.query(f.branches.list, {})).find((b) => b.name === "Abuja")!;
    expect(abuja.partner?.name).toBe("Ibrahim Danladi");
  });

  test("a single admin may approve their own partner", async () => {
    const s = await setup();
    const id = await s.t.mutation(f.branches.createPartner, { actorId: s.admin, branchId: s.branch("Abuja"), ...partner });
    await s.t.mutation(f.branches.approvePartner, { actorId: s.admin, partnerId: id });
    expect((await s.t.query(f.branches.listPartners, {}))[0].status).toBe("active");
  });

  test("changing the bank account needs approval again and stops payouts", async () => {
    const s = await setup();
    const id = await s.t.mutation(f.branches.createPartner, { actorId: s.admin, branchId: s.branch("Abuja"), ...partner });
    await s.t.mutation(f.branches.approvePartner, { actorId: s.admin, partnerId: id });
    await s.t.mutation(f.branches.updatePartner, { actorId: s.admin, partnerId: id, ...partner, accountNumber: "0123456789" });
    expect((await s.t.query(f.branches.listPartners, {}))[0].status).toBe("pending");
    expect((await s.t.query(f.branches.list, {})).find((b) => b.name === "Abuja")!.partner).toBeNull();
  });

  test("bad account numbers are refused", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(f.branches.createPartner, { actorId: s.admin, branchId: s.branch("Abuja"), ...partner, accountNumber: "12345" }),
    ).rejects.toThrow(/10 digits/);
  });
});

describe("clients and invoices", () => {
  test("invoice uses the monthly fee, adds VAT and numbers itself", async () => {
    const s = await setup();
    const clientId = await addClient(s, "Rayfield Estate", 1_260_000);
    const a = await s.t.mutation(f.invoices.create, { actorId: s.admin, clientId, period: "2026-10" });
    const b = await s.t.mutation(f.invoices.create, { actorId: s.admin, clientId, period: "2026-11" });
    expect(a.number).toBe("TSL-2026-0001");
    expect(b.number).toBe("TSL-2026-0002");
    const inv = await s.t.query(f.invoices.get, { invoiceId: a.id });
    expect(inv!.subtotalKobo).toBe(N(1_260_000));
    expect(inv!.vatKobo).toBe(N(94_500));
    expect(inv!.totalKobo).toBe(N(1_354_500));
    expect(inv!.status).toBe("draft");
    expect(inv!.dueDate).toBe("2026-10-31");
  });

  test("monthly billing skips clients already invoiced", async () => {
    const s = await setup();
    const c1 = await addClient(s, "A Estate");
    await addClient(s, "B Estate");
    await s.t.mutation(f.invoices.create, { actorId: s.admin, clientId: c1, period: "2026-10" });
    expect(await s.t.mutation(f.invoices.createMonthly, { actorId: s.admin, period: "2026-10" })).toEqual({ created: 1, skipped: 1 });
    expect(await s.t.mutation(f.invoices.createMonthly, { actorId: s.admin, period: "2026-10" })).toEqual({ created: 0, skipped: 2 });
  });

  test("payment account numbers are unique", async () => {
    const s = await setup();
    const c1 = await addClient(s, "A Estate");
    const c2 = await addClient(s, "B Estate");
    await s.t.mutation(f.clients.setPayAccount, { actorId: s.admin, clientId: c1, bankName: "Moniepoint MFB", accountNumber: "6012448901", provider: "manual" });
    await expect(
      s.t.mutation(f.clients.setPayAccount, { actorId: s.admin, clientId: c2, bankName: "Moniepoint MFB", accountNumber: "6012448901", provider: "manual" }),
    ).rejects.toThrow(/already belongs to A Estate/);
  });
});

describe("payments", () => {
  test("pays oldest invoices first, splits exactly, and logs it", async () => {
    const s = await setup();
    const clientId = await addClient(s, "Rayfield Estate", 1_000_000);
    const oct = await s.t.mutation(f.invoices.create, { actorId: s.admin, clientId, period: "2026-10" });
    const nov = await s.t.mutation(f.invoices.create, { actorId: s.admin, clientId, period: "2026-11" });
    // ₦1,075,000 per invoice (with VAT). Pay ₦1,500,000.
    await s.t.mutation(f.payments.record, { actorId: s.admin, clientId, amountKobo: N(1_500_000), receivedAt: Date.now() - 1000 });
    const octInv = await s.t.query(f.invoices.get, { invoiceId: oct.id });
    const novInv = await s.t.query(f.invoices.get, { invoiceId: nov.id });
    expect(octInv!.status).toBe("paid");
    expect(novInv!.status).toBe("part_paid");
    expect(novInv!.paidKobo).toBe(N(425_000));

    const { payments, sharedSplit } = await s.t.query(f.payments.list, {});
    expect(payments).toHaveLength(1);
    expect(payments[0].state).toBe("shared");
    expect(payments[0].split).toEqual({ hq: N(120_000), vat: N(112_500), partner: N(517_500), salary: N(750_000) });
    expect(sharedSplit.hq + sharedSplit.vat + sharedSplit.partner + sharedSplit.salary).toBe(N(1_500_000));
    expect((await audits(s.t)).some((a) => a.action === "finance.payment.recorded")).toBe(true);
  });

  test("the same bank reference is never recorded twice", async () => {
    const s = await setup();
    const clientId = await addClient(s);
    await s.t.mutation(f.payments.record, { actorId: s.admin, clientId, amountKobo: N(10_000), receivedAt: Date.now() - 1000, reference: "MNFY|1" });
    await expect(
      s.t.mutation(f.payments.record, { actorId: s.admin, clientId, amountKobo: N(10_000), receivedAt: Date.now() - 1000, reference: "MNFY|1" }),
    ).rejects.toThrow(/already recorded/);
    expect((await s.t.query(f.payments.list, {})).payments).toHaveLength(1);
  });

  test("a branch on hold keeps money held until released by a second admin", async () => {
    const s = await setup({ admins: 2 });
    const clientId = await addClient(s, "Trans-Amadi Depot", 1_000_000, "Port Harcourt");
    await s.t.mutation(f.branches.setHold, { actorId: s.admin, branchId: s.branch("Port Harcourt"), onHold: true, note: "Partner dispute" });
    const paymentId = await s.t.mutation(f.payments.record, { actorId: s.admin, clientId, amountKobo: N(200_000), receivedAt: Date.now() - 1000 });
    let list = await s.t.query(f.payments.list, {});
    expect(list.held.map((p) => p.id)).toEqual([paymentId]);
    expect(list.sharedSplit.hq).toBe(0);
    await expect(s.t.mutation(f.payments.release, { actorId: s.admin, paymentId })).rejects.toThrow(/different admin/);
    await s.t.mutation(f.payments.release, { actorId: s.admin2!, paymentId });
    list = await s.t.query(f.payments.list, {});
    expect(list.held).toHaveLength(0);
    expect(list.payments[0].state).toBe("shared");
  });

  test("undoing a typed-in payment puts the invoice back", async () => {
    const s = await setup();
    const clientId = await addClient(s, "Rayfield Estate", 1_000_000);
    const inv = await s.t.mutation(f.invoices.create, { actorId: s.admin, clientId, period: "2026-10" });
    await s.t.mutation(f.invoices.markSent, { actorId: s.admin, invoiceId: inv.id });
    const paymentId = await s.t.mutation(f.payments.record, { actorId: s.admin, clientId, amountKobo: N(1_075_000), receivedAt: Date.now() - 1000 });
    expect((await s.t.query(f.invoices.get, { invoiceId: inv.id }))!.status).toBe("paid");
    await expect(s.t.mutation(f.invoices.cancel, { actorId: s.admin, invoiceId: inv.id })).rejects.toThrow(/already has payments/);
    await s.t.mutation(f.payments.undoManual, { actorId: s.admin, paymentId });
    const after = await s.t.query(f.invoices.get, { invoiceId: inv.id });
    expect(after!.status).toBe("sent");
    expect(after!.paidKobo).toBe(0);
  });

  test("an invoice cannot be edited below what was already paid", async () => {
    const s = await setup();
    const clientId = await addClient(s, "Rayfield Estate", 1_000_000);
    const inv = await s.t.mutation(f.invoices.create, { actorId: s.admin, clientId, period: "2026-10" });
    await s.t.mutation(f.payments.record, { actorId: s.admin, clientId, amountKobo: N(500_000), receivedAt: Date.now() - 1000 });
    await expect(
      s.t.mutation(f.invoices.update, { actorId: s.admin, invoiceId: inv.id, lines: [{ description: "x", quantity: 1, unitKobo: N(100_000) }], dueDate: "2026-10-31" }),
    ).rejects.toThrow(/already paid/);
  });
});

describe("people", () => {
  const pay = { basicKobo: N(85_000), allowancesKobo: N(15_000) };

  test("staff get numbers; pay below minimum wage is refused", async () => {
    const s = await setup();
    const a = await s.t.mutation(f.people.createStaff, { actorId: s.admin, name: "Musa Ibrahim", branchId: s.branch("Jos"), role: "guard", ...pay });
    expect(a.staffNo).toBe("TSL-0001");
    await expect(
      s.t.mutation(f.people.createStaff, { actorId: s.admin, name: "Low Pay", branchId: s.branch("Jos"), role: "guard", basicKobo: N(50_000), allowancesKobo: 0 }),
    ).rejects.toThrow(/minimum wage/);
  });

  test("applicant can only be hired with a verified guarantor", async () => {
    const s = await setup();
    const applicantId = await s.t.mutation(f.people.createApplicant, { actorId: s.admin, name: "Grace Pam", branchId: s.branch("Jos") });
    await expect(s.t.mutation(f.people.hireApplicant, { actorId: s.admin, applicantId, role: "guard", ...pay })).rejects.toThrow(/guarantor/);
    await expect(s.t.mutation(f.people.updateApplicant, { actorId: s.admin, applicantId, guarantorVerified: true })).rejects.toThrow(/guarantor's name/);
    await s.t.mutation(f.people.updateApplicant, { actorId: s.admin, applicantId, guarantorName: "Pastor Pam", guarantorVerified: true });
    const hired = await s.t.mutation(f.people.hireApplicant, { actorId: s.admin, applicantId, role: "guard", ...pay });
    const staff = await s.t.query(f.people.listStaff, {});
    expect(staff.find((x) => x.id === hired.staffId)?.guarantorName).toBe("Pastor Pam");
    expect((await s.t.query(f.people.listApplicants, {}))[0].stage).toBe("hired");
  });

  test("roster shifts save, change and clear", async () => {
    const s = await setup();
    const { id } = await s.t.mutation(f.people.createStaff, { actorId: s.admin, name: "Musa Ibrahim", branchId: s.branch("Jos"), role: "guard", ...pay });
    await s.t.mutation(f.people.setShift, { actorId: s.admin, staffId: id, date: "2026-10-13", shift: "day" });
    await s.t.mutation(f.people.setShift, { actorId: s.admin, staffId: id, date: "2026-10-13", shift: "night" });
    await s.t.mutation(f.people.setShift, { actorId: s.admin, staffId: id, date: "2026-10-14", shift: "off" });
    let week = await s.t.query(f.people.rosterWeek, { branchId: s.branch("Jos"), day: "2026-10-15" });
    expect(week.days[0]).toBe("2026-10-12");
    expect(week.people[0].shifts.slice(0, 3)).toEqual([null, "night", "off"]);
    await s.t.mutation(f.people.setShift, { actorId: s.admin, staffId: id, date: "2026-10-13", shift: null });
    week = await s.t.query(f.people.rosterWeek, { branchId: s.branch("Jos"), day: "2026-10-15" });
    expect(week.people[0].shifts[1]).toBeNull();
  });
});

describe("payroll", () => {
  test("draft → approved → paid, with totals that add up", async () => {
    const s = await setup({ admins: 2 });
    const jos = s.branch("Jos");
    await s.t.mutation(f.people.createStaff, { actorId: s.admin, name: "Musa Ibrahim", branchId: jos, role: "guard", basicKobo: N(85_000), allowancesKobo: N(15_000) });
    const noBank = await s.t.mutation(f.people.createStaff, { actorId: s.admin, name: "Ngozi Eze", branchId: jos, role: "supervisor", basicKobo: N(140_000), allowancesKobo: N(25_000) });
    const suspended = await s.t.mutation(f.people.createStaff, { actorId: s.admin, name: "Off Pay", branchId: jos, role: "guard", basicKobo: N(85_000), allowancesKobo: 0 });
    await s.t.mutation(f.people.setStaffStatus, { actorId: s.admin, staffId: suspended.id, status: "suspended" });

    const runId = await s.t.mutation(f.payroll.generate, { actorId: s.admin, branchId: jos, period: "2026-10" });
    let view = await s.t.query(f.payroll.get, { branchId: jos, period: "2026-10" });
    expect(view.status).toBe("draft");
    expect(view.lines.map((l) => l.name)).toEqual(["Musa Ibrahim", "Ngozi Eze"]);
    expect(view.totals.gross).toBe(N(265_000));
    expect(view.totals.net).toBe(view.lines.reduce((sum, l) => sum + l.net, 0));

    // Nobody can be paid into a blank account.
    await expect(s.t.mutation(f.payroll.approve, { actorId: s.admin2!, runId })).rejects.toThrow(/bank details/);
    for (const staffId of [noBank.id, (await s.t.query(f.people.listStaff, {})).find((x) => x.name === "Musa Ibrahim")!.id]) {
      const st = (await s.t.query(f.people.listStaff, {})).find((x) => x.id === staffId)!;
      await s.t.mutation(f.people.updateStaff, {
        actorId: s.admin,
        staffId,
        name: st.name,
        branchId: jos,
        role: st.role,
        basicKobo: st.basicKobo,
        allowancesKobo: st.allowancesKobo,
        bankName: "GTBank",
        accountNumber: "0123456789",
      });
    }
    await s.t.mutation(f.payroll.generate, { actorId: s.admin, branchId: jos, period: "2026-10" });
    await expect(s.t.mutation(f.payroll.approve, { actorId: s.admin, runId })).rejects.toThrow(/different admin/);
    await s.t.mutation(f.payroll.approve, { actorId: s.admin2!, runId });
    await expect(s.t.mutation(f.payroll.generate, { actorId: s.admin, branchId: jos, period: "2026-10" })).rejects.toThrow(/already approved/);
    await s.t.mutation(f.payroll.markPaid, { actorId: s.admin, runId });
    view = await s.t.query(f.payroll.get, { branchId: jos, period: "2026-10" });
    expect(view.status).toBe("paid");
    // Paid payroll comes out of the branch's salary money.
    expect(view.salaryAvailableKobo).toBe(-view.totals.cost);
  });
});

describe("overview and reports", () => {
  test("late invoices and setup steps show up as things to do", async () => {
    const s = await setup();
    let ov = await s.t.query(f.overview.overview, {});
    expect(ov.todo[0].text).toBe("Add your first client");
    const clientId = await addClient(s, "Ikenegbu Hotel", 640_000, "Owerri");
    const inv = await s.t.mutation(f.invoices.create, { actorId: s.admin, clientId, period: "2026-09", dueDate: "2026-09-30" });
    await s.t.mutation(f.invoices.markSent, { actorId: s.admin, invoiceId: inv.id });
    ov = await s.t.query(f.overview.overview, {});
    expect(ov.todo.some((x) => x.kind === "overdue" && x.text.includes("Ikenegbu Hotel"))).toBe(true);
    expect(ov.owedKobo).toBe(N(688_000));
    expect(ov.todo.some((x) => x.kind === "account")).toBe(true);
  });

  test("monthly report adds up per branch", async () => {
    const s = await setup();
    const a = await addClient(s, "A", 100_000, "Jos");
    const b = await addClient(s, "B", 100_000, "Lagos");
    await s.t.mutation(f.payments.record, { actorId: s.admin, clientId: a, amountKobo: N(100_000), receivedAt: Date.now() - 1000 });
    await s.t.mutation(f.payments.record, { actorId: s.admin, clientId: b, amountKobo: N(300_000), receivedAt: Date.now() - 1000 });
    const r = await s.t.query(f.overview.reports, {});
    expect(r.byBranch.find((x) => x.branchName === "Lagos")!.split.partner).toBe(N(103_500));
    expect(r.byBranch.reduce((sum, x) => sum + x.receivedKobo, 0)).toBe(N(400_000));
  });
});
