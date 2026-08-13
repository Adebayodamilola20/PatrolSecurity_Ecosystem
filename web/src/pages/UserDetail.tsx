import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Mail, Phone, ShieldCheck, User2, AlertTriangle, Trash2, X } from 'lucide-react'
import { api } from '../services/api'
import { subscribeToScans, subscribeToShiftUpdates } from '../services/websocket'
import { useCanManageUsers } from '../stores/useAuthStore'
import { Skeleton } from '../components/ui/Skeleton'
import { formatDate, formatDuration, formatLateStatus } from '../utils/format'

type DeletionImpact = Awaited<ReturnType<typeof api.deletionImpact.user>>

type DateFilter = 'all' | 'today' | 'yesterday' | 'custom'

function dayBounds(d: Date) {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime(),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime(),
  }
}

// True when the given ISO timestamp falls within the chosen date filter.
function inRange(iso: string | null | undefined, filter: DateFilter, customDate: string): boolean {
  if (filter === 'all') return true
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  let day: Date | null = null
  if (filter === 'today') day = new Date()
  else if (filter === 'yesterday') { day = new Date(); day.setDate(day.getDate() - 1) }
  else if (filter === 'custom' && customDate) {
    const [yy, mm, dd] = customDate.split('-').map(Number)
    if (yy && mm && dd) day = new Date(yy, mm - 1, dd)
  }
  if (!day) return true
  const { start, end } = dayBounds(day)
  return t >= start && t <= end
}

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState<any>(null)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customDate, setCustomDate] = useState('')
  const canManage = useCanManageUsers()
  const [showDelete, setShowDelete] = useState(false)
  const [impact, setImpact] = useState<DeletionImpact | null>(null)
  const [impactError, setImpactError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    if (!id) return
    const load = () => {
      api.users.get(id).then(setUser).catch((err) => console.error('Failed to load user:', err))
    }
    load()
    const unsub = subscribeToShiftUpdates((payload: any) => {
      if (payload?.userId === id) {
        load()
      }
    })
    const unsubScans = subscribeToScans((payload: any) => {
      if (payload?.officerId === id) {
        load()
      }
    })
    return () => {
      unsub()
      unsubScans()
    }
  }, [id])

  // The counts come from the server rather than the already-loaded profile:
  // this page only holds recent shifts and scans, and "3 scans" next to a
  // delete button would read as the total.
  const openDelete = () => {
    if (!id) return
    setShowDelete(true)
    setImpact(null)
    setImpactError('')
    setDeleteError('')
    api.deletionImpact
      .user(id)
      .then(setImpact)
      .catch((err) =>
        setImpactError(err instanceof Error ? err.message : 'Could not load this guard’s record.'),
      )
  }

  const confirmDelete = async () => {
    if (!id) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.users.remove(id)
      navigate('/users')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this profile.')
      setDeleting(false)
    }
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const filteredShifts = (user.shifts || []).filter((s: any) => inRange(s.clockIn, dateFilter, customDate))
  const filteredScans = (user.scans || []).filter((s: any) => inRange(s.scannedAt, dateFilter, customDate))

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/users')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Officers
      </button>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">Delete {user.name}?</h2>
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleting}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {impactError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {impactError}
              </div>
            ) : !impact ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  This permanently removes their profile and their login. It cannot be undone.
                </p>

                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-destructive">Removed</div>
                  <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                    <li>Profile and login — they can no longer sign in</li>
                    {impact.assignedSites.length > 0 && (
                      <li>Posting to {impact.assignedSites.join(', ')}</li>
                    )}
                    {impact.onDuty && <li>Their open shift is clocked out</li>}
                  </ul>
                </div>

                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kept</div>
                  <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                    <li>{impact.scans} scan{impact.scans === 1 ? '' : 's'}</li>
                    <li>{impact.shifts} shift{impact.shifts === 1 ? '' : 's'}</li>
                    <li>{impact.incidents} incident{impact.incidents === 1 ? '' : 's'}</li>
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Their patrol record stays in reports and history under their name.
                  </p>
                </div>

                {impact.onDuty && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>They are clocked in right now. Deleting will end that shift.</span>
                  </div>
                )}
              </div>
            )}

            {deleteError && (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting || !impact}
                className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <User2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{user.name}</h1>
              <div className="mt-1 text-sm text-muted-foreground capitalize">{user.role}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-md px-2 py-1 font-semibold uppercase ${
                  user.onDuty ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                }`}>
                  {user.onDuty ? 'Clocked In' : 'Clocked Out'}
                </span>
                <span className={`rounded-md px-2 py-1 font-semibold uppercase ${
                  user.active ? 'bg-info/15 text-info' : 'bg-destructive/15 text-destructive'
                }`}>
                  {user.active ? 'Account Active' : 'Account Inactive'}
                </span>
              </div>

              {/* Directly under the duty badge, because "are they on shift"
                  and "where are they meant to be" are the same question and
                  the page used to answer only half of it. */}
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Assigned Location
                </div>
                {(user.assignedLocations || []).length === 0 ? (
                  <div className="mt-1 text-sm text-muted-foreground">Not yet appointed</div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {user.assignedLocations.map((place: any) => (
                      <div key={place.siteId} className="text-sm">
                        <span className="font-medium">{place.siteName}</span>
                        {place.clientName && (
                          <span className="text-muted-foreground"> · {place.clientName}</span>
                        )}
                        {place.subLocations?.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {place.subLocations.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {canManage && (
            <button
              onClick={openDelete}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> Delete Profile
            </button>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={user.email || 'N/A'} />
          <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={user.phone || 'N/A'} />
          <InfoRow icon={<Clock3 className="h-4 w-4" />} label="Last Clock In" value={user.onDuty ? formatDate(user.lastClockIn, 'Now') : formatDate(user.lastClockIn, 'None')} />
          <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Last Clock Out" value={formatDate(user.lastClockOut, 'None')} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Filter shifts &amp; scans:</span>
        {([['all', 'All'], ['today', 'Today'], ['yesterday', 'Yesterday']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setDateFilter(key); setCustomDate('') }}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              dateFilter === key
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="date"
          value={customDate}
          onChange={(e) => { setCustomDate(e.target.value); setDateFilter(e.target.value ? 'custom' : 'all') }}
          className={`rounded-lg border bg-card px-3 py-1.5 text-sm ${
            dateFilter === 'custom' ? 'border-primary text-primary' : 'border-border text-muted-foreground'
          }`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Recent Shifts</h2>
          <div className="mt-4 space-y-3">
            {filteredShifts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {(user.shifts || []).length === 0 ? 'No shifts yet.' : 'No shifts match this filter.'}
              </div>
            ) : filteredShifts.map((shift: any) => {
              const late = formatLateStatus(shift.scheduledStart, shift.clockIn)
              return (
                <div key={shift.id} className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{formatDate(shift.clockIn)}</span>
                    <span className={`flex items-center gap-1 text-xs font-semibold uppercase ${shift.status === 'active' ? 'text-success' : 'text-muted-foreground'}`}>
                      {late.late && <AlertTriangle className="h-3 w-3 text-warning" />}
                      {shift.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-muted-foreground">
                    <span>
                      {shift.clockOut ? `Clocked out ${formatDate(shift.clockOut)}` : 'Still on duty'}
                    </span>
                    <span className="text-xs">
                      {formatDuration(shift.clockIn, shift.clockOut)}
                      {late.late && <span className="ml-1 text-warning">({late.label})</span>}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Recent Scans</h2>
          <div className="mt-4 space-y-3">
            {filteredScans.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {(user.scans || []).length === 0 ? 'No scans yet.' : 'No scans match this filter.'}
              </div>
            ) : filteredScans.map((scan: any) => (
              <button
                key={scan.id}
                onClick={() => navigate(`/scans/${scan.id}`)}
                className="w-full rounded-lg border border-border/60 bg-background/40 p-3 text-left text-sm hover:bg-accent/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {scan.checkpointName}
                    {scan.checkpointActive === false && <span className="ml-1 text-[10px] text-muted-foreground/50">(Deactivated)</span>}
                  </span>
                  <span className={`text-xs font-semibold uppercase ${scan.gpsValid ? 'text-success' : 'text-warning'}`}>
                    {scan.gpsValid ? 'Verified' : 'Flagged'}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {formatDate(scan.scannedAt, 'Unknown time')}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-medium">{value}</div>
    </div>
  )
}
