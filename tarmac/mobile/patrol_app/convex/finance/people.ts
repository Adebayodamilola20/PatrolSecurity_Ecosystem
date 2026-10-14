import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { MINIMUM_WAGE_KOBO, assertKobo, cleanAccountNumber, isDay } from "../lib/finance";
import { audit, clean, fail, getBranch, nextNumber, required, todayWat } from "./shared";

const roleValidator = v.union(v.literal("guard"), v.literal("supervisor"), v.literal("office"));
const staffStatus = v.union(v.literal("active"), v.literal("leave"), v.literal("suspended"), v.literal("left"));

// ------------------------------------------------------------------- staff

function staffView(s: Doc<"finStaff">, branchName: string, photoUrl: string | null = null) {
  return {
    id: s._id,
    name: s.name,
    staffNo: s.staffNo,
    phone: s.phone ?? null,
    branchId: s.branchId,
    branchName,
    role: s.role,
    post: s.post ?? null,
    status: s.status,
    startDate: s.startDate ?? null,
    basicKobo: s.basicKobo,
    allowancesKobo: s.allowancesKobo,
    nhf: s.nhf,
    bankName: s.bankName ?? null,
    accountNumber: s.accountNumber ?? null,
    accountName: s.accountName ?? null,
    bankChecked: !!s.bankCode,
    photoUrl,
    pensionPin: s.pensionPin ?? null,
    guarantorName: s.guarantorName ?? null,
    guarantorPhone: s.guarantorPhone ?? null,
    guarantorVerified: s.guarantorVerified,
  };
}

export const listStaff = internalQuery({
  args: {},
  handler: async (ctx) => {
    const staff = await ctx.db.query("finStaff").collect();
    const branches = await ctx.db.query("finBranches").collect();
    const sorted = staff.sort((a, b) => Number(a.status === "left") - Number(b.status === "left") || a.name.localeCompare(b.name));
    return await Promise.all(
      sorted.map(async (s) =>
        staffView(s, branches.find((b) => b._id === s.branchId)?.name ?? "", s.photoId ? await ctx.storage.getUrl(s.photoId) : null),
      ),
    );
  },
});

const staffFields = {
  name: v.string(),
  phone: v.optional(v.string()),
  branchId: v.id("finBranches"),
  role: roleValidator,
  post: v.optional(v.string()),
  startDate: v.optional(v.string()),
  basicKobo: v.number(),
  allowancesKobo: v.number(),
  nhf: v.optional(v.boolean()),
  bankName: v.optional(v.string()),
  // Present only when the bank confirmed the account (routes.ts).
  bankCode: v.optional(v.string()),
  accountNumber: v.optional(v.string()),
  accountName: v.optional(v.string()),
  pensionPin: v.optional(v.string()),
  guarantorName: v.optional(v.string()),
  guarantorPhone: v.optional(v.string()),
  guarantorVerified: v.optional(v.boolean()),
};

type StaffInput = {
  name: string;
  phone?: string;
  role: "guard" | "supervisor" | "office";
  post?: string;
  startDate?: string;
  basicKobo: number;
  allowancesKobo: number;
  nhf?: boolean;
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  pensionPin?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorVerified?: boolean;
};

function checkedStaff(args: StaffInput) {
  assertKobo(args.basicKobo, "Basic pay");
  assertKobo(args.allowancesKobo, "Allowances");
  if (args.basicKobo < 0 || args.allowancesKobo < 0) fail("Pay cannot be negative");
  if (args.basicKobo + args.allowancesKobo < MINIMUM_WAGE_KOBO) fail("Monthly pay is below the ₦70,000 minimum wage");
  const startDate = clean(args.startDate, 10);
  if (startDate && !isDay(startDate)) fail("Start date is not a real date");
  const accountNumber = args.accountNumber?.trim() ? cleanAccountNumber(args.accountNumber) : undefined;
  return {
    name: required(args.name, "Name", 80),
    phone: clean(args.phone, 30),
    role: args.role,
    post: clean(args.post, 120),
    startDate,
    basicKobo: args.basicKobo,
    allowancesKobo: args.allowancesKobo,
    nhf: !!args.nhf,
    bankName: accountNumber ? clean(args.bankName, 80) : undefined,
    bankCode: accountNumber ? clean(args.bankCode, 6) : undefined,
    accountNumber,
    accountName: accountNumber ? clean(args.accountName, 120) : undefined,
    pensionPin: clean(args.pensionPin, 40),
    guarantorName: clean(args.guarantorName, 80),
    guarantorPhone: clean(args.guarantorPhone, 30),
    guarantorVerified: !!args.guarantorVerified,
  };
}

async function insertStaff(ctx: MutationCtx, actorId: Id<"users">, branchId: Id<"finBranches">, data: ReturnType<typeof checkedStaff>) {
  const branch = await getBranch(ctx, branchId);
  const seq = await nextNumber(ctx, "staff");
  const staffNo = `TSL-${String(seq).padStart(4, "0")}`;
  const id = await ctx.db.insert("finStaff", { ...data, staffNo, branchId: branch._id, status: "active", createdAt: Date.now() });
  await audit(ctx, actorId, "staff.created", "finStaff", id, `Added ${data.name} (${staffNo}) to ${branch.name}`);
  return { id, staffNo };
}

export const createStaff = internalMutation({
  args: { actorId: v.id("users"), ...staffFields },
  handler: async (ctx, args) => {
    return await insertStaff(ctx, args.actorId, args.branchId, checkedStaff(args));
  },
});

export const updateStaff = internalMutation({
  args: { actorId: v.id("users"), staffId: v.id("finStaff"), ...staffFields },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff) fail("Staff member not found");
    const branch = await getBranch(ctx, args.branchId);
    const data = checkedStaff(args);
    // Same account as before and not re-checked: keep the bank's earlier answer.
    if (data.accountNumber && data.accountNumber === staff.accountNumber && !data.bankCode) {
      data.bankCode = staff.bankCode;
      data.accountName = staff.accountName;
    }
    await ctx.db.patch(staff._id, { ...data, branchId: branch._id });
    const payChanged = data.basicKobo !== staff.basicKobo || data.allowancesKobo !== staff.allowancesKobo;
    const bankChanged = data.accountNumber !== staff.accountNumber;
    await audit(
      ctx,
      args.actorId,
      "staff.updated",
      "finStaff",
      staff._id,
      `Updated ${data.name}${payChanged ? " (pay changed)" : ""}${bankChanged ? " (bank account changed)" : ""}`,
    );
  },
});

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Saves an uploaded photo on a staff record, replacing (and deleting) the old
 * one. A refused file is deleted and the reason returned rather than thrown,
 * because throwing would undo the delete and leave the file behind.
 */
export const setStaffPhoto = internalMutation({
  args: { actorId: v.id("users"), staffId: v.id("finStaff"), storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<{ error?: string }> => {
    const staff = await ctx.db.get(args.staffId);
    const file = await ctx.db.system.get(args.storageId);
    if (!file) return { error: "The photo did not upload. Try again." };
    // The upload sets the type from the browser; a file without one is judged by size alone.
    const bad = !staff
      ? "Staff member not found"
      : (file.contentType && !file.contentType.startsWith("image/")) || file.size > PHOTO_MAX_BYTES
        ? "Choose a photo (JPG or PNG) smaller than 5 MB"
        : null;
    if (bad || !staff) {
      await ctx.storage.delete(args.storageId);
      return { error: bad ?? "Staff member not found" };
    }
    if (staff.photoId && staff.photoId !== args.storageId) await ctx.storage.delete(staff.photoId);
    await ctx.db.patch(staff._id, { photoId: args.storageId });
    await audit(ctx, args.actorId, "staff.photo", "finStaff", staff._id, `Updated photo for ${staff.name}`);
    return {};
  },
});

export const setStaffStatus = internalMutation({
  args: { actorId: v.id("users"), staffId: v.id("finStaff"), status: staffStatus },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff) fail("Staff member not found");
    await ctx.db.patch(staff._id, { status: args.status });
    await audit(ctx, args.actorId, "staff.status", "finStaff", staff._id, `${staff.name} is now ${args.status}`);
  },
});

// -------------------------------------------------------------- applicants

const STAGES = ["applied", "screening", "interview", "training"] as const;

export const listApplicants = internalQuery({
  args: {},
  handler: async (ctx) => {
    const applicants = await ctx.db.query("finApplicants").collect();
    const branches = await ctx.db.query("finBranches").collect();
    return applicants
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => ({
        id: a._id,
        name: a.name,
        phone: a.phone ?? null,
        branchId: a.branchId,
        branchName: branches.find((b) => b._id === a.branchId)?.name ?? "",
        stage: a.stage,
        appliedOn: a.appliedOn,
        guarantorName: a.guarantorName ?? null,
        guarantorPhone: a.guarantorPhone ?? null,
        guarantorVerified: a.guarantorVerified,
        notes: a.notes ?? null,
        staffId: a.staffId ?? null,
      }));
  },
});

export const createApplicant = internalMutation({
  args: {
    actorId: v.id("users"),
    name: v.string(),
    phone: v.optional(v.string()),
    branchId: v.id("finBranches"),
    guarantorName: v.optional(v.string()),
    guarantorPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const branch = await getBranch(ctx, args.branchId);
    const name = required(args.name, "Name", 80);
    const id = await ctx.db.insert("finApplicants", {
      name,
      phone: clean(args.phone, 30),
      branchId: branch._id,
      stage: "applied",
      appliedOn: todayWat(),
      guarantorName: clean(args.guarantorName, 80),
      guarantorPhone: clean(args.guarantorPhone, 30),
      guarantorVerified: false,
      notes: clean(args.notes, 500),
      createdAt: Date.now(),
    });
    await audit(ctx, args.actorId, "applicant.created", "finApplicant", id, `New applicant ${name} (${branch.name})`);
    return id;
  },
});

export const updateApplicant = internalMutation({
  args: {
    actorId: v.id("users"),
    applicantId: v.id("finApplicants"),
    stage: v.optional(v.union(...STAGES.map((s) => v.literal(s)), v.literal("rejected"))),
    guarantorName: v.optional(v.string()),
    guarantorPhone: v.optional(v.string()),
    guarantorVerified: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.applicantId);
    if (!a) fail("Applicant not found");
    if (a.stage === "hired") fail(`${a.name} is already hired — edit them in Staff instead`);
    const patch: Partial<Doc<"finApplicants">> = {};
    if (args.stage) patch.stage = args.stage;
    if (args.guarantorName !== undefined) patch.guarantorName = clean(args.guarantorName, 80);
    if (args.guarantorPhone !== undefined) patch.guarantorPhone = clean(args.guarantorPhone, 30);
    if (args.guarantorVerified !== undefined) {
      if (args.guarantorVerified && !(patch.guarantorName ?? a.guarantorName)) fail("Add the guarantor's name before marking them verified");
      patch.guarantorVerified = args.guarantorVerified;
    }
    if (args.notes !== undefined) patch.notes = clean(args.notes, 500);
    await ctx.db.patch(a._id, patch);
    const what = [
      args.stage && `moved to ${args.stage}`,
      args.guarantorVerified === true && "guarantor verified",
      args.guarantorVerified === false && "guarantor not verified",
    ].filter(Boolean).join(", ");
    await audit(ctx, args.actorId, "applicant.updated", "finApplicant", a._id, `${a.name}: ${what || "details updated"}`);
  },
});

/** Turns an applicant into a staff member. Needs a verified guarantor. */
export const hireApplicant = internalMutation({
  args: {
    actorId: v.id("users"),
    applicantId: v.id("finApplicants"),
    role: roleValidator,
    post: v.optional(v.string()),
    basicKobo: v.number(),
    allowancesKobo: v.number(),
    startDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.applicantId);
    if (!a) fail("Applicant not found");
    if (a.stage === "hired") fail(`${a.name} is already hired`);
    if (!a.guarantorVerified) fail(`${a.name}'s guarantor must be verified before they can be hired`);
    const data = checkedStaff({
      name: a.name,
      phone: a.phone,
      role: args.role,
      post: args.post,
      startDate: args.startDate ?? todayWat(),
      basicKobo: args.basicKobo,
      allowancesKobo: args.allowancesKobo,
      guarantorName: a.guarantorName,
      guarantorPhone: a.guarantorPhone,
      guarantorVerified: true,
    });
    const { id, staffNo } = await insertStaff(ctx, args.actorId, a.branchId, data);
    await ctx.db.patch(a._id, { stage: "hired", staffId: id });
    return { staffId: id, staffNo };
  },
});

// ------------------------------------------------------------------ roster

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `day`. */
export function weekStart(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(day, -offset);
}

export const rosterWeek = internalQuery({
  args: { branchId: v.id("finBranches"), day: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const start = weekStart(args.day && isDay(args.day) ? args.day : todayWat());
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const staff = (await ctx.db
      .query("finStaff")
      .withIndex("by_branchId", (q) => q.eq("branchId", args.branchId))
      .collect())
      .filter((s) => s.status !== "left")
      .sort((a, b) => a.name.localeCompare(b.name));
    const entries = await ctx.db
      .query("finRoster")
      .withIndex("by_branchId_date", (q) => q.eq("branchId", args.branchId).gte("date", days[0]).lte("date", days[6]))
      .collect();
    return {
      days,
      people: staff.map((s) => ({
        staffId: s._id,
        name: s.name,
        post: s.post ?? null,
        status: s.status,
        shifts: days.map((d) => entries.find((e) => e.staffId === s._id && e.date === d)?.shift ?? null),
      })),
    };
  },
});

export const setShift = internalMutation({
  args: {
    actorId: v.id("users"),
    staffId: v.id("finStaff"),
    date: v.string(),
    shift: v.union(v.literal("day"), v.literal("night"), v.literal("off"), v.null()),
  },
  handler: async (ctx, args) => {
    if (!isDay(args.date)) fail("Not a real date");
    const staff = await ctx.db.get(args.staffId);
    if (!staff) fail("Staff member not found");
    const existing = await ctx.db
      .query("finRoster")
      .withIndex("by_staffId_date", (q) => q.eq("staffId", staff._id).eq("date", args.date))
      .first();
    if (args.shift === null) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, { shift: args.shift });
    } else {
      await ctx.db.insert("finRoster", { staffId: staff._id, branchId: staff.branchId, date: args.date, shift: args.shift });
    }
  },
});
