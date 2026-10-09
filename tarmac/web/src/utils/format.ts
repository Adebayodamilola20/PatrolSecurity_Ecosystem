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

/**
 * A gap in words: "45m", "3h 10m", "2 days".
 *
 * Minutes alone stop being readable somewhere around an hour — nobody reads
 * "a patrol missed by 190 minutes" and pictures three hours.
 */
export function formatGap(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const leftoverHours = hours % 24
  return leftoverHours > 0 ? `${days}d ${leftoverHours}h` : `${days}d`
}

/**
 * How long ago something happened, for lists where the clock time alone
 * ("14:35") makes a reader work out whether that was minutes or days back.
 */
export function formatTimeAgo(value: string | Date | null | undefined, fallback = '—'): string {
  const d = safeDate(value)
  if (!d) return fallback
  const ms = Date.now() - d.getTime()
  if (ms < 60000) return 'just now'
  if (ms < 0) return formatTime(d)
  return `${formatGap(ms)} ago`
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
