// Plain helpers shared by the finance screens (kept out of ui.tsx so that
// file only exports components).

/** ₦1,234,500 — whole naira, tabular so columns line up. */
export function naira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

/** ₦1.23m / ₦845k for headline figures where the exact kobo isn't the point. */
export function nairaShort(amount: number) {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(2)}m`
  if (amount >= 1_000) return `₦${Math.round(amount / 1_000)}k`
  return naira(amount)
}

export function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(' ')
}

/**
 * The four-way split as one bar: shades of the brand blue for Tarmac's
 * shares, grey for VAT because that money belongs to the tax office.
 */
export const SHARES = [
  { key: 'hq', label: 'Head Office', pct: 8, className: 'bg-primary' },
  { key: 'vat', label: 'VAT', pct: 7.5, className: 'bg-muted-foreground/60' },
  { key: 'partner', label: 'Branch partner', pct: 34.5, className: 'bg-primary/60' },
  { key: 'salary', label: 'Branch salaries', pct: 50, className: 'bg-primary/25' },
] as const
