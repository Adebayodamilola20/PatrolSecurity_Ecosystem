import { useEffect, useState } from 'react'
import { AlertTriangle, AlertCircle, Info, Clock, ShieldAlert } from 'lucide-react'
import { api } from '../services/api'
import type { Incident, MissedPatrol } from '../types'

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
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [missedPatrols, setMissedPatrols] = useState<MissedPatrol[]>([])

  useEffect(() => {
    api.incidents.list().then(setIncidents).catch(() => {})
    api.incidents.missedPatrols().then(setMissedPatrols).catch(() => {})
  }, [])

  const handleAcknowledge = async (id: string) => {
    try {
      await api.incidents.updateStatus(id, 'resolved')
      setIncidents(prev => prev.filter(i => i.id !== id))
    } catch {}
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Notifications</div>
        <h1 className="text-2xl font-semibold">Alerts</h1>
      </div>

      {(missedPatrols.length > 0 || incidents.length > 0) ? (
        <div className="space-y-3">
          {missedPatrols.map((mp, i) => {
            const Icon = ShieldAlert
            const color = severityColor[mp.type]
            return (
              <div key={`missed-${i}`} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">Missed Patrol — {mp.checkpointName}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {mp.timeOverdue || 'Never scanned'}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">{mp.message}</div>
                </div>
              </div>
            )
          })}
          {incidents.map((inc) => {
            const Icon = severityIcon[inc.severity] || Info
            const color = severityColor[inc.severity]
            const timeAgo = (() => {
              const diff = Date.now() - new Date(inc.reportedAt).getTime()
              const mins = Math.floor(diff / 60000)
              if (mins < 60) return `${mins}m ago`
              return `${Math.floor(mins / 60)}h ago`
            })()
            return (
              <div key={inc.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{inc.title}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {timeAgo}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {inc.description} {inc.checkpointName ? `· ${inc.checkpointName}` : ''}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {inc.status !== 'resolved' && (
                      <button
                        onClick={() => handleAcknowledge(inc.id)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
                      >
                        Acknowledge
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
