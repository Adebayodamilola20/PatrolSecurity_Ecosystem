import { useEffect, useState } from 'react'
import { User, MapPin, Camera, CheckCircle, XCircle } from 'lucide-react'
import { api } from '../services/api'

const API_BASE = ''

export default function Timesheets() {
  const [timesheets, setTimesheets] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [officerFilter, setOfficerFilter] = useState('')

  useEffect(() => {
    api.timesheets.list().then(setTimesheets).catch(() => {})
    api.timesheets.summary().then(setSummary).catch(() => {})
  }, [])

  const filtered = officerFilter
    ? timesheets.filter(t => t.userName.toLowerCase().includes(officerFilter.toLowerCase()))
    : timesheets

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">GPS Verified</div>
        <h1 className="text-2xl font-semibold">Timesheets</h1>
      </div>

      {summary && (
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
        {filtered.map((t) => {
          const photoUrl = t.clockInPhoto ? `${API_BASE}${t.clockInPhoto}` : null
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
                      <div className="text-sm font-medium">{new Date(t.clockIn).toLocaleString()}</div>
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
                      <div className="text-sm font-medium">{t.duration}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Scans</div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        <span>{t.scanCount} total</span>
                        <span className="text-success">{t.verifiedScans} verified</span>
                        <span className={t.scanCount - t.verifiedScans > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                          {t.scanCount - t.verifiedScans} flagged
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {t.scans.length > 0 && (
                <div className="border-t border-border divide-y divide-border/50">
                  {t.scans.map((scan: any) => (
                    <div key={scan.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                      {scan.gpsValid
                        ? <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      }
                      <span className="text-muted-foreground">{new Date(scan.scannedAt).toLocaleTimeString()}</span>
                      <span className="font-medium">{scan.checkpointName}</span>
                      <span className="text-muted-foreground">({scan.checkpointCode})</span>
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
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            No timesheets found
          </div>
        )}
      </div>
    </div>
  )
}
