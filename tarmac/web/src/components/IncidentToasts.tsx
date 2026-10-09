import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, MapPin, User2, X } from 'lucide-react'
import { api } from '../services/api'
import { subscribeToIncidents } from '../services/websocket'
import { useAlertStore } from '../stores/useAlertStore'
import type { Incident } from '../types'
import { formatDate } from '../utils/format'

const AUTO_DISMISS_MS = 12_000
const MAX_VISIBLE = 3

const severityStyle: Record<string, string> = {
  critical: 'border-destructive/40 bg-destructive text-destructive-foreground',
  high: 'border-warning/40 bg-warning text-black',
  medium: 'border-info/40 bg-info text-white',
  low: 'border-border bg-card text-foreground',
}

export default function IncidentToasts() {
  const [toasts, setToasts] = useState<Incident[]>([])
  const navigate = useNavigate()
  const setOpenIncidentCount = useAlertStore((s) => s.setOpenIncidentCount)
  const incrementOpenIncidents = useAlertStore((s) => s.incrementOpenIncidents)

  useEffect(() => {
    api.incidents
      .list({ status: 'open' })
      .then((rows) => setOpenIncidentCount(Array.isArray(rows) ? rows.length : 0))
      .catch(() => {})
  }, [setOpenIncidentCount])

  useEffect(() => {
    return subscribeToIncidents((incident: Incident) => {
      if (!incident?.id) return
      incrementOpenIncidents()
      setToasts((prev) => [incident, ...prev.filter((t) => t.id !== incident.id)].slice(0, MAX_VISIBLE))
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== incident.id))
      }, AUTO_DISMISS_MS)
    })
  }, [incrementOpenIncidents])

  if (toasts.length === 0) return null

  return (
    <div className="fixed right-3 top-16 z-[70] flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-2 md:right-5 md:top-20">
      {toasts.map((incident) => {
        const headerStyle = severityStyle[incident.severity] ?? severityStyle.low
        return (
          <div
            key={incident.id}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in slide-in-from-right"
          >
            <div className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${headerStyle}`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              New Incident — {incident.severity}
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== incident.id))}
                className="ml-auto rounded p-0.5 opacity-80 hover:opacity-100"
                aria-label="Dismiss incident notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5 p-3">
              <div className="text-sm font-medium">{incident.title}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {incident.officerName && (
                  <span className="flex items-center gap-1"><User2 className="h-3 w-3" /> {incident.officerName}</span>
                )}
                {(incident.checkpointName || incident.siteName) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {incident.checkpointName || incident.siteName}
                  </span>
                )}
                <span>{formatDate(incident.reportedAt)}</span>
              </div>
              <button
                onClick={() => {
                  setToasts((prev) => prev.filter((t) => t.id !== incident.id))
                  navigate('/alerts')
                }}
                className="mt-1 w-full rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent"
              >
                View details
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
