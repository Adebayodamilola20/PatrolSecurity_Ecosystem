// Plain helpers shared by the finance screens. Amounts arrive as kobo.

export function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(' ')
}

/** ₦1,234,500 — kobo shown only when there are some. */
export function naira(kobo: number) {
  const value = kobo / 100
  const hasKobo = Math.round(kobo) % 100 !== 0
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: hasKobo ? 2 : 0, maximumFractionDigits: 2 })}`
}

/** Naira typed into a box ("1,260,000") → kobo, or null if it is not a number. */
export function toKobo(text: string): number | null {
  const cleaned = text.replace(/[₦,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

/** Kobo → the naira text to pre-fill an input box with. */
export function toNairaText(kobo: number) {
  return (kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Today's date in Nigeria as "2026-10-13". */
export function todayWat() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function thisPeriod() {
  return todayWat().slice(0, 7)
}

export function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** The last `back` months and the next one, newest first, for month pickers. */
export function monthOptions(back = 12) {
  const [y, m] = thisPeriod().split('-').map(Number)
  const out: { value: string; label: string }[] = []
  for (let i = -1; i < back; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    const value = d.toISOString().slice(0, 7)
    out.push({ value, label: periodLabel(value) })
  }
  return out
}

/** "13 Oct 2026" */
export function dateLabel(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`
}

/** A timestamp as "13 Oct 2026, 10:42" in Nigerian time. */
export function dateTimeLabel(ms: number) {
  const iso = new Date(ms + 60 * 60 * 1000).toISOString()
  return `${dateLabel(iso.slice(0, 10))}, ${iso.slice(11, 16)}`
}

/** "2026-10-13" (Nigerian date) → a timestamp for a recorded payment: now if
 *  it is today, otherwise midday that day. */
export function dayToMs(day: string) {
  return day === todayWat() ? Date.now() : Date.parse(`${day}T11:00:00Z`)
}

/** Basis points → "34.5%" */
export function pct(bps: number) {
  return `${bps / 100}%`
}

/** Writes rows to a CSV file that opens in Excel. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const text = rows
    .map((row) => row.map((cell) => {
      const s = String(cell ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\r\n')
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Kobo as a plain number of naira for spreadsheets. */
export function nairaPlain(kobo: number) {
  return (kobo / 100).toFixed(2)
}
