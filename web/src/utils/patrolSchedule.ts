import { safeDate } from './format'

export type ScheduleStatusKind = 'early' | 'on-time' | 'late' | 'unscheduled'

export interface ScheduleStatus {
  kind: ScheduleStatusKind
  diffMinutes: number
  absMinutes: number
  label: string
  detail: string
}

function buildScheduledDate(day: Date, time: string | null | undefined) {
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const scheduled = new Date(day)
  scheduled.setHours(hours, minutes, 0, 0)
  return scheduled
}

export function getScheduleStatus(
  actualValue: string | Date | null | undefined,
  scheduledTime: string | null | undefined,
  options?: { graceMinutes?: number; mode?: 'arrival' | 'departure' },
): ScheduleStatus {
  const actual = safeDate(actualValue)
  if (!actual) {
    return { kind: 'unscheduled', diffMinutes: 0, absMinutes: 0, label: 'Unknown', detail: 'No activity time available.' }
  }

  const scheduled = buildScheduledDate(actual, scheduledTime)
  if (!scheduled) {
    return { kind: 'unscheduled', diffMinutes: 0, absMinutes: 0, label: 'Unscheduled', detail: 'No checkpoint schedule set.' }
  }

  const mode = options?.mode ?? 'arrival'
  const graceMinutes = options?.graceMinutes ?? 5
  const diffMinutes = Math.round((actual.getTime() - scheduled.getTime()) / 60000)
  const absMinutes = Math.abs(diffMinutes)

  if (absMinutes <= graceMinutes) {
    return {
      kind: 'on-time',
      diffMinutes,
      absMinutes,
      label: 'On time',
      detail: mode === 'arrival'
        ? `Arrived within the ${graceMinutes}-minute grace window.`
        : `Closed within the ${graceMinutes}-minute grace window.`,
    }
  }

  if (diffMinutes < 0) {
    return {
      kind: 'early',
      diffMinutes,
      absMinutes,
      label: `${absMinutes} min early`,
      detail: mode === 'arrival'
        ? `Reached site ${absMinutes} minutes before the expected time.`
        : `Closed patrol ${absMinutes} minutes before the target clock-out time.`,
    }
  }

  return {
    kind: 'late',
    diffMinutes,
    absMinutes,
    label: `${absMinutes} min late`,
    detail: mode === 'arrival'
      ? `Started patrol ${absMinutes} minutes after the expected site time.`
      : `Still active ${absMinutes} minutes past the target clock-out time.`,
  }
}
