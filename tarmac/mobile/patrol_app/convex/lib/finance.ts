/**
 * Money maths for the Tarmac finance package.
 *
 * Every amount is an integer number of kobo (₦1 = 100 kobo). Nothing here
 * touches the database, so it can be tested exhaustively and the screens never
 * do their own arithmetic.
 *
 * Rules to confirm with Tarmac's accountant before go-live are marked ACCOUNTANT.
 */

import { ConvexError } from "convex/values";

export const KOBO = 100;

/** Basis points: 10,000 = 100%. */
export type SplitBps = { hq: number; vat: number; partner: number; salary: number };
export type SplitKobo = { hq: number; vat: number; partner: number; salary: number };

/** Tarmac's sharing rule: Head Office 8%, VAT 7.5%, partner 34.5%, salaries 50%. */
export const DEFAULT_SPLIT_BPS: SplitBps = { hq: 800, vat: 750, partner: 3450, salary: 5000 };

export function assertKobo(amount: number, label = "Amount") {
  if (!Number.isSafeInteger(amount)) throw new ConvexError(`${label} must be a whole number of kobo`);
}

export function validateSplit(bps: SplitBps) {
  for (const part of [bps.hq, bps.vat, bps.partner, bps.salary]) {
    if (!Number.isInteger(part) || part < 0) throw new ConvexError("Each share must be a whole, non-negative percentage");
  }
  if (bps.hq + bps.vat + bps.partner + bps.salary !== 10_000) {
    throw new ConvexError("The four shares must add up to exactly 100%");
  }
}

/**
 * Shares one payment. Head Office, VAT and partner are rounded down; whatever
 * kobo is left over goes to branch salaries, so the four always add up to the
 * payment exactly.
 */
export function splitPayment(amountKobo: number, bps: SplitBps = DEFAULT_SPLIT_BPS): SplitKobo {
  assertKobo(amountKobo);
  if (amountKobo < 0) throw new ConvexError("A payment cannot be negative");
  validateSplit(bps);
  const hq = Math.floor((amountKobo * bps.hq) / 10_000);
  const vat = Math.floor((amountKobo * bps.vat) / 10_000);
  const partner = Math.floor((amountKobo * bps.partner) / 10_000);
  return { hq, vat, partner, salary: amountKobo - hq - vat - partner };
}

export function addSplits(a: SplitKobo, b: SplitKobo): SplitKobo {
  return { hq: a.hq + b.hq, vat: a.vat + b.vat, partner: a.partner + b.partner, salary: a.salary + b.salary };
}

export const ZERO_SPLIT: SplitKobo = { hq: 0, vat: 0, partner: 0, salary: 0 };

/** VAT on an invoice: 7.5% of the subtotal, rounded to the nearest kobo. */
export const VAT_BPS = 750;

export function invoiceTotals(lines: { quantity: number; unitKobo: number }[]) {
  let subtotal = 0;
  for (const line of lines) {
    assertKobo(line.unitKobo, "Price");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new ConvexError("Quantity must be more than zero");
    subtotal += Math.round(line.quantity * line.unitKobo);
  }
  // ACCOUNTANT: assumes client prices exclude VAT and VAT is added on top.
  const vat = Math.round((subtotal * VAT_BPS) / 10_000);
  return { subtotal, vat, total: subtotal + vat };
}

/**
 * PAYE bands under the Nigeria Tax Act 2025 (from January 2026), on annual
 * taxable income in naira.
 * ACCOUNTANT: confirm bands and which reliefs (rent relief etc.) Tarmac applies.
 */
const PAYE_BANDS_NAIRA: { upTo: number; rate: number }[] = [
  { upTo: 800_000, rate: 0 },
  { upTo: 3_000_000, rate: 0.15 },
  { upTo: 12_000_000, rate: 0.18 },
  { upTo: 25_000_000, rate: 0.21 },
  { upTo: 50_000_000, rate: 0.23 },
  { upTo: Infinity, rate: 0.25 },
];

/** Annual PAYE in kobo for an annual taxable income in kobo. */
export function annualPaye(taxableKobo: number): number {
  if (taxableKobo <= 0) return 0;
  let remaining = taxableKobo;
  let lower = 0;
  let tax = 0;
  for (const band of PAYE_BANDS_NAIRA) {
    const upper = band.upTo === Infinity ? Infinity : band.upTo * KOBO;
    const width = Math.min(remaining, upper - lower);
    if (width <= 0) break;
    tax += width * band.rate;
    remaining -= width;
    lower = upper;
  }
  return Math.round(tax);
}

export const PENSION_EMPLOYEE_BPS = 800; // 8% of basic, deducted from pay
export const PENSION_EMPLOYER_BPS = 1000; // 10% of basic, paid by Tarmac on top
export const NHF_BPS = 250; // 2.5% of basic, only for staff who opt in
export const MINIMUM_WAGE_KOBO = 70_000 * KOBO;

export type PayLine = {
  basic: number;
  allowances: number;
  gross: number;
  pension: number;
  nhf: number;
  paye: number;
  net: number;
  employerPension: number;
  /** What the branch salary account pays out for this person. */
  cost: number;
};

/** One person's month: gross, deductions and take-home, all in kobo. */
export function payLine(basicKobo: number, allowancesKobo: number, opts: { nhf?: boolean } = {}): PayLine {
  assertKobo(basicKobo, "Basic pay");
  assertKobo(allowancesKobo, "Allowances");
  if (basicKobo < 0 || allowancesKobo < 0) throw new ConvexError("Pay cannot be negative");
  const gross = basicKobo + allowancesKobo;
  const pension = Math.round((basicKobo * PENSION_EMPLOYEE_BPS) / 10_000);
  const nhf = opts.nhf ? Math.round((basicKobo * NHF_BPS) / 10_000) : 0;
  // Taxable income = gross − pension − NHF (both are tax-deductible).
  const monthlyTaxable = Math.max(0, gross - pension - nhf);
  const paye = Math.round(annualPaye(monthlyTaxable * 12) / 12);
  const net = gross - pension - nhf - paye;
  const employerPension = Math.round((basicKobo * PENSION_EMPLOYER_BPS) / 10_000);
  return { basic: basicKobo, allowances: allowancesKobo, gross, pension, nhf, paye, net, employerPension, cost: gross + employerPension };
}

/** "2026-10" → true. */
export function isPeriod(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "2026-10-13" → true (calendar-checked). */
export function isDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Last day of a "YYYY-MM" period as "YYYY-MM-DD". */
export function endOfPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

/** Nigerian (WAT, UTC+1) calendar date for a timestamp. */
export function watDate(at: number) {
  return new Date(at + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Naira from a form ("85,000" / 85000.5) to kobo. */
export function nairaToKobo(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[₦,\s]/g, ""));
  if (!Number.isFinite(n)) throw new ConvexError("Enter an amount in naira");
  return Math.round(n * KOBO);
}

/** Nigerian bank account numbers (NUBAN) are 10 digits. */
export function cleanAccountNumber(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 10) throw new ConvexError("Account number must be 10 digits");
  return digits;
}
