import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Mail, Phone, ShieldCheck, User2, AlertTriangle } from 'lucide-react'
import { api } from '../services/api'
import { subscribeToShiftUpdates } from '../services/websocket'
import { Skeleton } from '../components/ui/Skeleton'
import { formatDate, formatDuration, formatLateStatus } from '../utils/format'

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    if (!id) return
    const load = () => {
      api.users.get(id).then(setUser).catch(() => {})
    }
    load()
    const unsub = subscribeToShiftUpdates((payload: any) => {
      if (payload?.userId === id) {
        load()
      }
    })
    return unsub
  }, [id])

  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/users')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Officers
      </button>

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
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={user.email || 'N/A'} />
          <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={user.phone || 'N/A'} />
          <InfoRow icon={<Clock3 className="h-4 w-4" />} label="Last Clock In" value={user.onDuty ? formatDate(user.lastClockIn, 'Now') : formatDate(user.lastClockIn, 'None')} />
          <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Last Clock Out" value={formatDate(user.lastClockOut, 'None')} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Recent Shifts</h2>
          <div className="mt-4 space-y-3">
            {(user.shifts || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No shifts yet.</div>
            ) : user.shifts.map((shift: any) => {
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
            {(user.scans || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No scans yet.</div>
            ) : user.scans.map((scan: any) => (
              <button
                key={scan.id}
                onClick={() => navigate(`/scans/${scan.id}`)}
                className="w-full rounded-lg border border-border/60 bg-background/40 p-3 text-left text-sm hover:bg-accent/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{scan.checkpointName}</span>
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
