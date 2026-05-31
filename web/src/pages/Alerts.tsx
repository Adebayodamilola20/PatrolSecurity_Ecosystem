import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info, Clock, ShieldAlert, User2, MapPin, RefreshCw, Mail } from 'lucide-react'
import { api } from '../services/api'
import { useAuthStore } from '../stores/useAuthStore'
import type { Incident, MissedPatrol } from '../types'
import { formatDate } from '../utils/format'

const severityIcon: Record<string, typeof AlertTriangle> = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: Info,
  low: Info,
}

const severityColor: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive',
  high: 'bg-warning/15 text-warning',
  medium: 'bg-info/15 text-info',
  low: 'bg-muted text-muted-foreground',
  overdue: 'bg-destructive/15 text-destructive',
  never_scanned: 'bg-warning/15 text-warning',
}

export default function Alerts() {
  const userRole = useAuthStore((s) => s.user?.role)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [missedPatrols, setMissedPatrols] = useState<MissedPatrol[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (userRole === 'guard') {
    return <Navigate to="/" replace />
  }

  useEffect(() => {
    loadAlerts()
  }, [])

  const loadAlerts = async () => {
    setLoading(true)
    setError(null)
    try {
      const [incidentRows, missedRows] = await Promise.all([
        api.incidents.list(),
        api.missedPatrols.list({ status: 'open' }),
      ])
      setIncidents(incidentRows)
      setMissedPatrols(missedRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckMissedPatrols = async () => {
    setChecking(true)
    setError(null)
    try {
      await api.missedPatrols.checkNow()
      await loadAlerts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check missed patrols')
    } finally {
      setChecking(false)
    }
  }

  const handleAcknowledge = async (id: string) => {
    try {
      await api.incidents.updateStatus(id, 'resolved')
      setIncidents(prev => prev.filter(i => i.id !== id))
    } catch {}
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Notifications</div>
            <h1 className="text-2xl font-semibold">Alerts & Incidents</h1>
          </div>
          <button
            onClick={handleCheckMissedPatrols}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Check missed patrols now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          Loading alerts...
        </div>
      ) : (missedPatrols.length > 0 || incidents.length > 0) ? (
        <div className="space-y-3">
          {missedPatrols.map((mp, i) => {
            const Icon = ShieldAlert
            const type = mp.type || (mp.lastScanAt || mp.lastScan ? 'overdue' : 'never_scanned')
            const color = severityColor[type]
            const lastScan = mp.lastScanAt || mp.lastScan
            return (
              <div key={mp.id || `missed-${i}`} className="rounded-xl border border-destructive/25 bg-card p-4 flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">Missed Patrol — {mp.checkpointName}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {mp.dueAt ? `Due ${formatDate(mp.dueAt)}` : mp.timeOverdue || 'Never scanned'}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {mp.message || `No scan received within ${mp.expectedIntervalMinutes ?? 'configured'} minutes${mp.gracePeriodMinutes != null ? ` plus ${mp.gracePeriodMinutes} minutes grace` : ''}.`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {mp.siteName && (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {mp.siteName}</span>
                    )}
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last scan: {lastScan ? formatDate(lastScan) : 'Never'}</span>
                    {mp.notificationStatus && (
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {mp.notificationStatus.replaceAll('_', ' ')}</span>
                    )}
                    <span className="uppercase text-warning">{mp.status || 'open'}</span>
                  </div>
                </div>
              </div>
            )
          })}
          {incidents.map((inc) => {
            const Icon = severityIcon[inc.severity] || Info
            const color = severityColor[inc.severity]
            return (
              <div key={inc.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{inc.title}</div>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${color}`}>
                      {inc.severity}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User2 className="h-3 w-3" /> {inc.officerName}
                    </span>
                    {inc.checkpointName && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {inc.checkpointName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDate(inc.reportedAt)}
                    </span>
                    <span className={`uppercase ${inc.status === 'resolved' ? 'text-success' : 'text-warning'}`}>
                      {inc.status}
                    </span>
                  </div>
                  {inc.description && (
                    <div className="mt-2 text-sm text-muted-foreground">{inc.description}</div>
                  )}
                  <div className="mt-3 flex gap-2">
                    {inc.status !== 'resolved' && (
                      <button
                        onClick={() => handleAcknowledge(inc.id)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
                      >
                        Acknowledge & Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          No alerts at this time
        </div>
      )}
    </div>
  )
}
