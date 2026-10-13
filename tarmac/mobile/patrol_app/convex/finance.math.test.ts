import { describe, expect, test } from "vitest";
import {
  annualPaye,
  cleanAccountNumber,
  endOfPeriod,
  invoiceTotals,
  isDay,
  isPeriod,
  nairaToKobo,
  payLine,
  splitPayment,
  validateSplit,
} from "./lib/finance";

const N = (naira: number) => naira * 100;

describe("payment split", () => {
  test("₦1,000,000 splits 8 / 7.5 / 34.5 / 50", () => {
    expect(splitPayment(N(1_000_000))).toEqual({ hq: N(80_000), vat: N(75_000), partner: N(345_000), salary: N(500_000) });
  });

  test("odd amounts always add up exactly; leftover kobo goes to salaries", () => {
    for (const amount of [1, 7, 99, 101, 1_234_567, 999_999_999, N(1_451_250) + 37]) {
      const s = splitPayment(amount);
      expect(s.hq + s.vat + s.partner + s.salary).toBe(amount);
      expect(Math.min(s.hq, s.vat, s.partner, s.salary)).toBeGreaterThanOrEqual(0);
    }
    expect(splitPayment(7)).toEqual({ hq: 0, vat: 0, partner: 2, salary: 5 });
  });

  test("custom shares must total 100%", () => {
    expect(() => validateSplit({ hq: 800, vat: 750, partner: 3450, salary: 4999 })).toThrow(/100%/);
    expect(splitPayment(N(100), { hq: 0, vat: 0, partner: 0, salary: 10_000 })).toEqual({ hq: 0, vat: 0, partner: 0, salary: N(100) });
  });

  test("rejects fractions and negatives", () => {
    expect(() => splitPayment(10.5)).toThrow();
    expect(() => splitPayment(-1)).toThrow();
  });
});

describe("invoices", () => {
  test("adds 7.5% VAT on top of the subtotal", () => {
    expect(invoiceTotals([{ quantity: 1, unitKobo: N(1_260_000) }])).toEqual({ subtotal: N(1_260_000), vat: N(94_500), total: N(1_354_500) });
  });
  test("multiple lines and quantities", () => {
    const t = invoiceTotals([{ quantity: 10, unitKobo: N(70_000) }, { quantity: 1, unitKobo: N(50_000) }]);
    expect(t.subtotal).toBe(N(750_000));
    expect(t.total).toBe(N(806_250));
  });
  test("refuses zero quantity", () => {
    expect(() => invoiceTotals([{ quantity: 0, unitKobo: 100 }])).toThrow();
  });
});

describe("PAYE (Nigeria Tax Act 2025 bands)", () => {
  test("first ₦800,000 a year is tax free", () => {
    expect(annualPaye(N(800_000))).toBe(0);
  });
  test("band edges", () => {
    expect(annualPaye(N(1_000_000))).toBe(N(30_000));
    expect(annualPaye(N(3_000_000))).toBe(N(330_000));
    expect(annualPaye(N(12_000_000))).toBe(N(1_950_000));
    expect(annualPaye(N(60_000_000))).toBe(N(330_000 + 1_620_000 + 2_730_000 + 5_750_000 + 2_500_000));
  });
});

describe("pay lines", () => {
  test("guard on ₦85,000 basic + ₦15,000 allowances", () => {
    const line = payLine(N(85_000), N(15_000));
    expect(line.gross).toBe(N(100_000));
    expect(line.pension).toBe(N(6_800));
    expect(line.paye).toBe(N(3_980));
    expect(line.net).toBe(N(100_000 - 6_800 - 3_980));
    expect(line.employerPension).toBe(N(8_500));
    expect(line.cost).toBe(N(108_500));
  });
  test("low pay is tax free", () => {
    expect(payLine(N(70_000), 0).paye).toBe(0);
  });
  test("NHF only when opted in", () => {
    expect(payLine(N(100_000), 0).nhf).toBe(0);
    expect(payLine(N(100_000), 0, { nhf: true }).nhf).toBe(N(2_500));
  });
});

describe("input helpers", () => {
  test("naira to kobo", () => {
    expect(nairaToKobo("₦1,260,000")).toBe(N(1_260_000));
    expect(nairaToKobo(85000.5)).toBe(8_500_050);
    expect(() => nairaToKobo("abc")).toThrow();
  });
  test("account numbers", () => {
    expect(cleanAccountNumber("000 644 1103")).toBe("0006441103");
    expect(() => cleanAccountNumber("12345")).toThrow(/10 digits/);
  });
  test("dates", () => {
    expect(isPeriod("2026-10")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isDay("2026-02-30")).toBe(false);
    expect(endOfPeriod("2026-02")).toBe("2026-02-28");
  });
});
