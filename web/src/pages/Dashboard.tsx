import { useEffect, useState } from 'react'
import {
  Activity,
  ClipboardCheck,
  Users,
  Filter,
  ChevronRight,
  QrCode,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PatrolMap } from '../components/PatrolMap'
import { useScanStore, useScanWebSocket } from '../stores/useScanStore'
import { api } from '../services/api'
import { StatsCardSkeleton } from '../components/ui/Skeleton'

const toneBg: Record<string, string> = {
  info: 'bg-info/15 text-info',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  primary: 'bg-primary/15 text-primary',
  destructive: 'bg-destructive/15 text-destructive',
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    verified: 'bg-success/15 text-success',
    flagged: 'bg-warning/15 text-warning',
    pending: 'bg-info/15 text-info',
  }
  return map[s] ?? 'bg-muted text-muted-foreground'
}

const officerInitials = (name?: string) => {
  const safeName = (name || '').trim()
  if (!safeName) return 'Unknown Officer'
  return safeName.split(/\s+/).map((n: string) => n[0]).join('. ')
}

export default function Dashboard() {
  const { scans, stats, loading, fetchScans, fetchStats } = useScanStore()
  const [missedPatrols, setMissedPatrols] = useState<any[]>([])
  const [incidents, setIncidents] = useState<any[]>([])
  const [missingClockins, setMissingClockins] = useState<any[]>([])
  const [timesheetSummary, setTimesheetSummary] = useState<any>(null)
  const [loadingData, setLoadingData] = useState(true)
  const navigate = useNavigate()
  useScanWebSocket()

  useEffect(() => {
    Promise.all([
      api.incidents.missedPatrols().catch(() => []),
      api.incidents.list().catch(() => []),
      api.shifts.missingClockins().catch(() => []),
      api.timesheets.summary().catch(() => null),
    ]).then(([mp, inc, mc, ts]) => {
      setMissedPatrols(mp as any[])
      setIncidents(inc as any[])
      setMissingClockins(mc as any[])
      setTimesheetSummary(ts)
      setLoadingData(false)
    })
  }, [])

  useEffect(() => {
    fetchScans()
    fetchStats()
    const interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [])

  const statCards = [
    { label: 'Total Scans', value: String(stats.totalScans), delta: '+12', icon: ClipboardCheck, tone: 'info' as const, to: '/scans' },
    { label: 'Active Officers', value: String(stats.activeOfficers), delta: '+2', icon: Users, tone: 'success' as const, to: '/users' },
    { label: 'Scans Today', value: String(stats.scansToday), delta: '+18%', icon: QrCode, tone: 'warning' as const, to: '/scans' },
    { label: 'Alerts', value: String(missedPatrols.length + incidents.length + missingClockins.length), delta: `${missedPatrols.length} missed`, icon: AlertTriangle, tone: 'destructive' as const, to: '/alerts' },
  ]

  const recentScans = scans.slice(0, 5).map((s) => ({
    id: s.id,
    displayId: `#SC-${s.id.slice(0, 4).toUpperCase()}`,
    // Show the human checkpoint name. The code is an auto-generated QR UUID and
    // is only a fallback when a name is somehow missing.
    cp: s.checkpointName || s.checkpointCode || 'Unknown checkpoint',
    deactivated: s.checkpointActive === false,
    officer: officerInitials(s.officerName),
    time: (() => {
      const diff = Date.now() - new Date(s.scannedAt).getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 60) return `${mins}m ago`
      return `${Math.floor(mins / 60)}h ago`
    })(),
    status: s.gpsValid ? 'verified' : 'flagged',
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Overview / Live</div>
          <h1 className="text-2xl font-semibold">Patrol Monitoring</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
            <Filter className="h-4 w-4" /> Filter
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Activity className="h-4 w-4" /> Generate Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || loadingData ? (
          Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)
        ) : (
          statCards.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.label}
                onClick={() => navigate(s.to)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneBg[s.tone]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-muted-foreground">{s.delta}</span>
                </div>
                <div className="mt-3 text-2xl font-semibold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </button>
            )
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 rounded-xl border border-border bg-card p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Live Scan Feed</h2>
            <span className="flex items-center gap-1.5 text-[11px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Realtime
            </span>
          </div>
          <div className="mt-3 space-y-2 overflow-y-auto pr-1 max-h-[520px]">
            {recentScans.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/scans/${s.id}`)}
                className="w-full rounded-lg border border-border/60 bg-background/40 p-3 hover:bg-accent/40 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <QrCode className="h-3.5 w-3.5" />
                    </div>
                    <div className="text-sm font-medium">{s.displayId}</div>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(s.status)}`}>
                    {s.status}
                  </span>
                </div>
                <div className={`mt-2 text-xs ${s.deactivated ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                  {s.cp}
                  {s.deactivated && <span className="ml-1 text-[10px]">(Deactivated)</span>}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{s.officer}</span>
                  <span>{s.time}</span>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate('/scans')}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            View all scans <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card p-2 h-[300px] md:h-[420px]">
            <PatrolMap />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => navigate('/timesheets')}
              className="rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Timesheet Summary (7d)</div>
                  <div className="mt-0.5 font-semibold">{timesheetSummary?.totalShifts || 0} Shifts</div>
                </div>
                <Activity className="h-5 w-5 text-info" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Active Now</div>
                  <div className="text-sm font-medium text-success">{timesheetSummary?.activeShifts || 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Today</div>
                  <div className="text-sm font-medium">{timesheetSummary?.todayShifts || 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total Hours</div>
                  <div className="text-sm font-medium">{timesheetSummary?.totalHours || 0}h</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => navigate('/alerts')}
              className="rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Alerts Overview</div>
                  <div className="mt-0.5 font-semibold">{missedPatrols.length + incidents.length} Active Alerts</div>
                </div>
                <ShieldAlert className="h-5 w-5 text-destructive" />
              </div>
              <div className="mt-3 space-y-2">
                {missedPatrols.slice(0, 2).map((mp, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                    <span className="truncate">{mp.checkpointName}: {mp.type === 'overdue' ? mp.timeOverdue : 'Never scanned'}</span>
                  </div>
                ))}
                {missingClockins.slice(0, 2).map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                    <span className="truncate">{m.userName}: Missing clock-in</span>
                  </div>
                ))}
                {incidents.slice(0, 2).map((inc) => (
                  <div key={inc.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3 text-info shrink-0" />
                    <span className="truncate">{inc.title}</span>
                  </div>
                ))}
                {(missedPatrols.length + incidents.length + missingClockins.length) === 0 && (
                  <div className="text-xs text-muted-foreground">No active alerts</div>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
