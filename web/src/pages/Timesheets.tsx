import { useEffect, useState } from 'react'
import { User, MapPin, Camera, CheckCircle, XCircle, Clock } from 'lucide-react'
import { api } from '../services/api'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { getScheduleStatus } from '../utils/patrolSchedule'
import { formatDuration } from '../utils/format'
import { subscribeToScans, subscribeToShiftUpdates } from '../services/websocket'

const API_BASE = ''

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

  const load = async () => {
    setLoading(true)
    setError('')
    let nextError = ''

    try {
      const [timesheetResult, summaryResult] = await Promise.allSettled([
        api.timesheets.list(),
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
  }

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
  }, [])

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

      <div className="flex items-center gap-3">
        <input
          value={officerFilter}
          onChange={e => setOfficerFilter(e.target.value)}
          placeholder="Filter by officer name..."
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm flex-1 max-w-xs"
        />
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
            const scanCount = typeof t.scanCount === 'number' ? t.scanCount : scans.length
            const verifiedScans = typeof t.verifiedScans === 'number'
              ? t.verifiedScans
              : scans.filter((scan: any) => scan?.gpsValid).length
            const photoUrl = t.clockInPhoto ? `${API_BASE}${t.clockInPhoto}` : null
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
                        <div className="text-sm font-medium">{t.clockIn ? new Date(t.clockIn).toLocaleString() : '-'}</div>
                        {t.clockInLatitude && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {t.clockInLatitude.toFixed(4)}, {t.clockInLongitude?.toFixed(4)}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-muted-foreground">Clock Out</div>
                        <div className="text-sm font-medium">{t.clockOut ? new Date(t.clockOut).toLocaleString() : 'In Progress'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Duration</div>
                        <div className="text-sm font-medium">{displayDuration}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Scans</div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          <span>{scanCount} total</span>
                          <span className="text-success">{verifiedScans} verified</span>
                          <span className={scanCount - verifiedScans > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                            {scanCount - verifiedScans} flagged
                          </span>
                        </div>
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
