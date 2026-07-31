import { useEffect, useState, useCallback } from 'react'
import { User, MapPin, Camera, CheckCircle, XCircle, Clock } from 'lucide-react'
import { api } from '../services/api'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { getScheduleStatus } from '../utils/patrolSchedule'
import { formatDate, formatDuration } from '../utils/format'
import { subscribeToScans, subscribeToShiftUpdates } from '../services/websocket'
import { photoSrc } from '../utils/photo'

type DateFilter = 'all' | 'today' | 'yesterday' | 'custom'

// Build an ISO start/end range (local-day boundaries) for the chosen date
// filter. The backend /timesheets route already filters on these via the
// `start` and `end` query params.
function computeRange(dateFilter: DateFilter, customDate: string): { start?: string; end?: string } {
  const dayRange = (d: Date) => ({
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString(),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString(),
  })
  if (dateFilter === 'today') return dayRange(new Date())
  if (dateFilter === 'yesterday') {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    return dayRange(y)
  }
  if (dateFilter === 'custom' && customDate) {
    const [yy, mm, dd] = customDate.split('-').map(Number)
    if (yy && mm && dd) return dayRange(new Date(yy, mm - 1, dd))
  }
  return {}
}

function mapsLink(lat?: number | null, lng?: number | null): string | null {
  return lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null
}

function normalizeTimesheet(row: any, index = 0) {
  const scans = Array.isArray(row?.scans) ? row.scans : []
  const scanCount = typeof row?.scanCount === 'number' ? row.scanCount : scans.length
  const verifiedScans = typeof row?.verifiedScans === 'number'
    ? row.verifiedScans
    : scans.filter((scan: any) => scan?.gpsValid).length

  return {
    ...row,
    shiftId: row?.shiftId ?? row?.id ?? `${row?.userId ?? 'shift'}-${row?.clockIn ?? row?.createdAt ?? index}`,
    userName: row?.userName ?? row?.username ?? 'Unknown officer',
    userEmail: row?.userEmail ?? row?.useremail ?? '',
    userPhone: row?.userPhone ?? row?.userphone ?? '',
    clockIn: row?.clockIn ?? row?.clockin ?? null,
    clockOut: row?.clockOut ?? row?.clockout ?? null,
    clockInPhoto: row?.clockInPhoto ?? row?.clockinphoto ?? '',
    clockInLatitude: row?.clockInLatitude ?? row?.clockinlatitude ?? null,
    clockInLongitude: row?.clockInLongitude ?? row?.clockinlongitude ?? null,
    clockOutLatitude: row?.clockOutLatitude ?? row?.clockoutlatitude ?? null,
    clockOutLongitude: row?.clockOutLongitude ?? row?.clockoutlongitude ?? null,
    status: row?.status ?? 'completed',
    scans,
    scanCount,
    verifiedScans,
  }
}

export default function Timesheets() {
  const [timesheets, setTimesheets] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [officerFilter, setOfficerFilter] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customDate, setCustomDate] = useState('')
  const [error, setError] = useState('')

  const fallbackTimesheetsFromShifts = async () => {
    const shifts = await api.shifts.list()
    return (Array.isArray(shifts) ? shifts : []).map((shift: any) => ({
      shiftId: shift.id,
      userId: shift.userId ?? shift.userid ?? '',
      userName: shift.userName ?? shift.username ?? 'Unknown officer',
      userEmail: shift.userEmail ?? shift.useremail ?? '',
      userPhone: shift.userPhone ?? shift.userphone ?? '',
      clockIn: shift.clockIn ?? shift.clockin ?? null,
      clockOut: shift.clockOut ?? shift.clockout ?? null,
      duration: shift.clockIn ? `${Math.max(0, Math.round(((new Date(shift.clockOut ?? new Date().toISOString()).getTime() - new Date(shift.clockIn).getTime()) / 60000)))}m` : '—',
      durationMinutes: shift.clockIn
        ? Math.max(0, Math.round((new Date(shift.clockOut ?? new Date().toISOString()).getTime() - new Date(shift.clockIn).getTime()) / 60000))
        : 0,
      clockInPhoto: shift.clockInPhoto ?? shift.clockinphoto ?? '',
      clockInLatitude: shift.clockInLatitude ?? shift.clockinlatitude ?? null,
      clockInLongitude: shift.clockInLongitude ?? shift.clockinlongitude ?? null,
      clockOutLatitude: shift.clockOutLatitude ?? shift.clockoutlatitude ?? null,
      clockOutLongitude: shift.clockOutLongitude ?? shift.clockoutlongitude ?? null,
      status: shift.status ?? 'completed',
      scans: [],
      scanCount: 0,
      verifiedScans: 0,
    }))
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    let nextError = ''

    const range = computeRange(dateFilter, customDate)
    // The live backend (Convex) reads startDate/endDate; the legacy Express
    // backend reads start/end. Send both so the filter works either way.
    const listParams: Record<string, string> = {}
    if (range.start) { listParams.startDate = range.start; listParams.start = range.start }
    if (range.end) { listParams.endDate = range.end; listParams.end = range.end }

    try {
      const [timesheetResult, summaryResult] = await Promise.allSettled([
        api.timesheets.list(listParams),
        api.timesheets.summary(),
      ])

      if (timesheetResult.status === 'fulfilled') {
        setTimesheets((Array.isArray(timesheetResult.value) ? timesheetResult.value : []).map(normalizeTimesheet))
      } else {
        try {
          const fallback = await fallbackTimesheetsFromShifts()
          setTimesheets(fallback.map(normalizeTimesheet))
          nextError = 'Detailed timesheet scans could not load, so this page is showing basic shift records.'
        } catch (fallbackError) {
          setTimesheets([])
          nextError = fallbackError instanceof Error
            ? fallbackError.message
            : 'Could not load timesheets. Please try again.'
        }
      }

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value)
      } else {
        setSummary(null)
        if (!nextError) {
          nextError = summaryResult.reason instanceof Error
            ? summaryResult.reason.message
            : 'Could not load timesheet summary right now.'
        }
      }
    } catch (err) {
      setTimesheets([])
      setSummary(null)
      nextError = err instanceof Error
        ? err.message
        : 'Could not load timesheets. Please try again.'
    } finally {
      setError(nextError)
      setLoading(false)
    }
  }, [dateFilter, customDate])

  useEffect(() => {
    void load()

    const handleRetry = () => {
      void load()
    }

    const unsubShifts = subscribeToShiftUpdates(() => {
      void load()
    })
    const unsubScans = subscribeToScans(() => {
      void load()
    })

    window.addEventListener('app:retry', handleRetry)
    return () => {
      unsubShifts()
      unsubScans()
      window.removeEventListener('app:retry', handleRetry)
    }
  }, [load])

  const filtered = officerFilter
    ? timesheets.filter(t => (t.userName || '').toLowerCase().includes(officerFilter.toLowerCase()))
    : timesheets

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">GPS Verified</div>
        <h1 className="text-2xl font-semibold">Timesheets</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Total Shifts (7d)</div>
            <div className="mt-1 text-2xl font-semibold">{summary.totalShifts}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Active Now</div>
            <div className="mt-1 text-2xl font-semibold text-success">{summary.activeShifts}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Today's Shifts</div>
            <div className="mt-1 text-2xl font-semibold">{summary.todayShifts}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Total Hours</div>
            <div className="mt-1 text-2xl font-semibold">{summary.totalHours}h</div>
          </div>
        </div>
      )}

      {error && filtered.length > 0 && (
        <div className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          {error}
        </div>
      )}

      {summary?.byUser && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Per Officer (7d)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.byUser.map((u: any) => (
              <div key={u.userId} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-sm font-medium">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.shifts} shifts · {u.hours}h</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          value={officerFilter}
          onChange={e => setOfficerFilter(e.target.value)}
          placeholder="Filter by officer name..."
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm flex-1 max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {([['all', 'All'], ['today', 'Today'], ['yesterday', 'Yesterday']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setDateFilter(key); setCustomDate('') }}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                dateFilter === key
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent'
              }`}
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            value={customDate}
            onChange={e => { setCustomDate(e.target.value); setDateFilter(e.target.value ? 'custom' : 'all') }}
            className={`rounded-lg border bg-background px-3 py-1.5 text-sm ${
              dateFilter === 'custom' ? 'border-primary text-primary' : 'border-border text-muted-foreground'
            }`}
          />
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start gap-4">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-7 w-7" />}
            title={error ? 'Timesheets unavailable' : 'No timesheets found'}
            description={error || (officerFilter ? 'No officers match your filter.' : 'No shifts have been recorded yet.')}
            action={error ? (
              <button
                onClick={load}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Try again
              </button>
            ) : undefined}
          />
        ) : (
          filtered.map((t) => {
            const scans = Array.isArray(t.scans) ? t.scans : []
            const photoUrl = photoSrc(t.clockInPhoto)
            const displayDuration = t.duration && t.duration !== '—'
              ? t.duration
              : formatDuration(t.clockIn, t.clockOut)
            return (
              <div key={t.shiftId} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-4 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <User className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{t.userName}</div>
                        <div className="text-xs text-muted-foreground">{t.userEmail}</div>
                      </div>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        t.status === 'active' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                      }`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Clock In</div>
                        <div className="text-sm font-medium">{t.clockIn ? formatDate(t.clockIn) : '-'}</div>
                        {mapsLink(t.clockInLatitude, t.clockInLongitude) ? (
                          <a
                            href={mapsLink(t.clockInLatitude, t.clockInLongitude)!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-info hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <MapPin className="h-3 w-3" /> {t.clockInLatitude.toFixed(5)}, {t.clockInLongitude.toFixed(5)}
                          </a>
                        ) : (
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">No location captured</div>
                        )}
                      </div>
                      <div>
                        <div className="text-muted-foreground">Clock Out</div>
                        <div className="text-sm font-medium">{t.clockOut ? formatDate(t.clockOut) : 'In Progress'}</div>
                        {mapsLink(t.clockOutLatitude, t.clockOutLongitude) ? (
                          <a
                            href={mapsLink(t.clockOutLatitude, t.clockOutLongitude)!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-info hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <MapPin className="h-3 w-3" /> {t.clockOutLatitude.toFixed(5)}, {t.clockOutLongitude.toFixed(5)}
                          </a>
                        ) : (
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">{t.clockOut ? 'No location captured' : '—'}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-muted-foreground">Duration</div>
                        <div className="text-sm font-medium">{displayDuration}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Scanned Location{scans.length === 1 ? '' : 's'}</div>
                        {scans.length === 0 ? (
                          <div className="text-sm font-medium text-muted-foreground/70">No scans recorded</div>
                        ) : (
                          <div className="mt-0.5 space-y-1">
                            {scans.map((scan: any) => (
                              <div key={scan.id} className="flex items-center gap-1.5">
                                {scan.gpsValid
                                  ? <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
                                  : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                                <span className="text-sm font-medium truncate">{scan.checkpointName || scan.checkpointCode || 'Checkpoint'}</span>
                                <span className={`text-[10px] font-semibold ${scan.gpsValid ? 'text-success' : 'text-destructive'}`}>
                                  {scan.gpsValid ? 'Verified' : 'Unverified'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {scans.length > 0 && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {scans.map((scan: any) => (
                      <div key={scan.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                        {scan.gpsValid
                          ? <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
                          : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        }
                        <span className="text-muted-foreground">{new Date(scan.scannedAt).toLocaleTimeString()}</span>
                        <span className="font-medium">
                          {scan.checkpointName}
                          {scan.checkpointActive === false && <span className="ml-1 text-[10px] text-muted-foreground/50">(Deactivated)</span>}
                        </span>
                        <span className="text-muted-foreground">({scan.checkpointCode})</span>
                        {(() => {
                          const status = getScheduleStatus(scan.scannedAt, scan.scheduledTimeIn, { mode: 'arrival' })
                          if (status.kind === 'unscheduled') return null
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              status.kind === 'late'
                                ? 'bg-destructive/10 text-destructive'
                                : status.kind === 'early'
                                  ? 'bg-info/10 text-info'
                                  : 'bg-success/10 text-success'
                            }`}>
                              {status.label}
                            </span>
                          )
                        })()}
                        <span className="text-muted-foreground ml-auto">{scan.distanceMeters ? `${scan.distanceMeters}m` : '-'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {photoUrl && (
                  <div className="border-t border-border px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" />
                    <span>Selfie: </span>
                    <img src={photoUrl} alt="Selfie" className="h-10 w-10 rounded-lg object-cover" />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
