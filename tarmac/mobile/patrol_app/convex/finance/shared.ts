import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { watDate } from "../lib/finance";

/** A readable error that reaches the screen as-is. */
export function fail(message: string): never {
  throw new ConvexError(message);
}

/**
 * Writes the change log row in the same transaction as the change itself, so
 * a money action can never happen without its record (or the other way round).
 */
export async function audit(
  ctx: MutationCtx,
  // A user, or "monnify" for payments that arrive by themselves.
  actorId: Id<"users"> | "monnify",
  action: string,
  targetType: string,
  targetId: string,
  details: string,
) {
  await ctx.db.insert("auditLogs", {
    action: `finance.${action}`,
    actorId,
    actorRole: actorId === "monnify" ? "system" : "admin",
    targetType,
    targetId,
    details,
    success: true,
    timestamp: Date.now(),
  });
}

/** Next number in a sequence (invoices, staff numbers). Transactional. */
export async function nextNumber(ctx: MutationCtx, key: string): Promise<number> {
  const row = await ctx.db
    .query("finCounters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, { value: row.value + 1 });
    return row.value + 1;
  }
  await ctx.db.insert("finCounters", { key, value: 1 });
  return 1;
}

/**
 * Second-person rule for money decisions (approving a partner, approving a
 * payroll, releasing held money): the approver must not be the person who set
 * it up — unless Tarmac has only one active admin, in which case the single
 * admin may approve and the change log shows it.
 */
export async function assertSecondPerson(
  ctx: MutationCtx,
  creatorId: Id<"users"> | undefined,
  approverId: Id<"users">,
) {
  if (!creatorId || creatorId !== approverId) return;
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  if (admins.filter((a) => a.active).length > 1) {
    fail("A different admin must approve this. You set it up, so someone else at Head Office needs to approve it.");
  }
}

export async function getBranch(ctx: QueryCtx, id: Id<"finBranches">): Promise<Doc<"finBranches">> {
  const branch = await ctx.db.get(id);
  if (!branch) fail("Branch not found");
  return branch;
}

export function todayWat() {
  return watDate(Date.now());
}

/** "2026-10" for a timestamp, in Nigerian time. */
export function periodOf(at: number) {
  return watDate(at).slice(0, 7);
}

/** UTC start/end (ms) of a "YYYY-MM" period in Nigerian time. */
export function periodRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const wat = 60 * 60 * 1000;
  return { start: Date.UTC(y, m - 1, 1) - wat, end: Date.UTC(y, m, 1) - wat };
}

export function clean(value: unknown, max = 200): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim().slice(0, max);
  return s ? s : undefined;
}

export function required(value: unknown, label: string, max = 200): string {
  const s = clean(value, max);
  if (!s) fail(`${label} is required`);
  return s;
}
