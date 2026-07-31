/*
 * Every time in this product is a Nigerian operational time — a guard clocked in
 * at a Nigerian site at a Nigerian hour. Rendering in the viewer's own timezone
 * meant a supervisor on a laptop set to another region saw "09:00" for a shift
 * that started at 11:00, and shift/lateness figures were read off those wrong
 * numbers. Pin the display zone so the wall clock always matches the site.
 */
export const OPERATING_TIME_ZONE = 'Africa/Lagos'

export function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const d = safeDate(value)
  return d
    ? d.toLocaleString('en-GB', {
        timeZone: OPERATING_TIME_ZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : fallback
}

export function formatTime(value: string | Date | null | undefined, fallback = '—'): string {
  const d = safeDate(value)
  return d
    ? d.toLocaleTimeString('en-GB', {
        timeZone: OPERATING_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : fallback
}

export function formatDuration(clockIn: string | Date | null | undefined, clockOut: string | Date | null | undefined): string {
  const start = safeDate(clockIn)
  const end = safeDate(clockOut) || new Date()
  if (!start) return '—'
  const ms = end.getTime() - start.getTime()
  const hrs = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

export function formatLateStatus(scheduled: string | Date | null | undefined, actual: string | Date | null | undefined): { late: boolean; minutes: number; label: string } {
  const s = safeDate(scheduled)
  const a = safeDate(actual)
  if (!s || !a) return { late: false, minutes: 0, label: '—' }
  const diff = a.getTime() - s.getTime()
  const mins = Math.round(diff / 60000)
  if (mins <= 0) return { late: false, minutes: 0, label: 'On time' }
  return { late: true, minutes: mins, label: `Late by ${mins} min` }
}
