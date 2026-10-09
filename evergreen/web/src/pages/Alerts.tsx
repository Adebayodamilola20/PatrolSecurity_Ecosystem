import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info, Clock, ShieldAlert, User2, MapPin, MessageSquare, RefreshCw, Mail, Search, ChevronDown, Camera, ExternalLink } from 'lucide-react'
import { api } from '../services/api'
import { CardSkeleton } from '../components/ui/Skeleton'
import { useAuthStore } from '../stores/useAuthStore'
import { useAlertStore } from '../stores/useAlertStore'
import type { Incident, MissedPatrol } from '../types'
import { formatDate } from '../utils/format'
import { photoSrc } from '../utils/photo'
import { PageHeader } from '../components/ui/PageHeader'

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
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'investigating' | 'resolved'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'incidents' | 'missed'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const setOpenIncidentCount = useAlertStore((s) => s.setOpenIncidentCount)
  // Guard observations: quick notes, not incidents. They sit above the
  // incident list because they are the cheapest thing to action and the
  // easiest to lose.
  const [observations, setObservations] = useState<Awaited<ReturnType<typeof api.observations.list>>>([])
  const [ackingObservation, setAckingObservation] = useState<string | null>(null)
  const [emergencies, setEmergencies] = useState<Awaited<ReturnType<typeof api.emergency.active>>>([])
  const [resolvingEmergency, setResolvingEmergency] = useState<string | null>(null)

  if (userRole === 'guard') {
    return <Navigate to="/" replace />
  }

  useEffect(() => {
    loadAlerts()
    // This page loaded once and never again, so an emergency raised while it
    // was open simply never appeared — staff had to know to press reload,
    // which is precisely what nobody does during an emergency. Poll instead.
    const timer = window.setInterval(loadAlerts, 15_000)
    const onFocus = () => loadAlerts()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAlerts = async () => {
    setLoading(true)
    setError(null)
    try {
      const [incidentRows, missedRows, observationRows, emergencyRows] = await Promise.all([
        api.incidents.list(),
        api.missedPatrols.list({ status: 'open' }),
        api.observations.list().catch(() => []),
        api.emergency.active().catch(() => []),
      ])
      setIncidents(incidentRows)
      setMissedPatrols(missedRows)
      setObservations(observationRows)
      setEmergencies(emergencyRows)
      setOpenIncidentCount(incidentRows.filter((i: Incident) => i.status === 'open').length)
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
      const next = incidents.filter(i => i.id !== id)
      setIncidents(next)
      setOpenIncidentCount(next.filter(i => i.status === 'open').length)
    } catch {}
  }

  const q = search.trim().toLowerCase()
  const filteredIncidents = incidents.filter((inc) => {
    const matchSearch =
      !q ||
      (inc.title ?? '').toLowerCase().includes(q) ||
      (inc.officerName ?? '').toLowerCase().includes(q) ||
      (inc.checkpointName ?? '').toLowerCase().includes(q)
    const matchSeverity = severityFilter === 'all' || inc.severity === severityFilter
    const matchStatus = statusFilter === 'all' || inc.status === statusFilter
    const matchType = typeFilter === 'all' || typeFilter === 'incidents'
    return matchSearch && matchSeverity && matchStatus && matchType
  })
  const filteredMissed = missedPatrols.filter((mp) => {
    const matchSearch =
      !q ||
      (mp.checkpointName ?? '').toLowerCase().includes(q) ||
      (mp.siteName ?? '').toLowerCase().includes(q)
    const matchType = typeFilter === 'all' || typeFilter === 'missed'
    // Severity is incident-only; missed patrols only show when severity isn't narrowed.
    const matchSeverity = severityFilter === 'all'
    const matchStatus = statusFilter === 'all' || statusFilter === 'open'
    return matchSearch && matchType && matchSeverity && matchStatus
  })

  return (
    <div className="space-y-5">
      <div>
        <PageHeader
          eyebrow="Notifications"
          title="Alerts & Incidents"
          blurb="Emergencies, missed patrols and anything else needing a decision."
          actions={
            <button
              onClick={handleCheckMissedPatrols}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check missed patrols now'}
            </button>
          }
        />
      </div>

      {/* CODE RED. Deliberately unlike every other card on this page — solid
          red, top of the page, its own vocabulary. An emergency that reads
          like a notification gets treated like one. */}
      {emergencies.map((sos) => (
        <div key={sos.id} className="overflow-hidden rounded-xl border-2 border-destructive bg-destructive/10">
          <div className="flex items-center gap-3 bg-destructive px-4 py-2 text-destructive-foreground">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span className="text-lg font-black tracking-wide">🚨 CODE RED</span>
            <span className="text-sm font-semibold uppercase tracking-wider">Emergency Alert</span>
            {/* The kind of emergency the guard picked on the phone. It was
                collected and then never shown, so the room saw "emergency"
                without knowing whether to send an ambulance. */}
            {sos.category && sos.category !== 'Other' && (
              <span className="rounded bg-destructive-foreground/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                {sos.category}
              </span>
            )}
            <span className="ml-auto text-xs font-semibold uppercase">
              {sos.source === 'client' ? 'Raised by client' : 'Raised by guard'}
            </span>
          </div>
          <div className="space-y-3 p-4">
            <div className="text-base font-semibold">{sos.message}</div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Raised by </span>
                <span className="font-medium">{sos.officerName || 'Unknown'}</span>
                {sos.officerRole && <span className="text-muted-foreground"> ({sos.officerRole})</span>}
              </div>
              <div>
                <span className="text-muted-foreground">Phone </span>
                {sos.officerPhone ? (
                  <a href={`tel:${sos.officerPhone}`} className="font-medium text-primary hover:underline">
                    {sos.officerPhone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">not on file</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Client </span>
                <span className="font-medium">{sos.clientName ?? 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Location </span>
                <span className="font-medium">{sos.checkpointName ?? sos.siteName ?? 'Unknown'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Time </span>
                <span className="font-medium">{formatDate(sos.triggeredAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status </span>
                <span className="font-medium uppercase">{sos.status}</span>
                {sos.acknowledgedByName && (
                  <span className="text-muted-foreground"> · seen by {sos.acknowledgedByName}</span>
                )}
                {sos.respondingByName && (
                  <span className="text-muted-foreground"> · {sos.respondingByName} responding</span>
                )}
              </div>
              {/* Whether the texts went out is a separate question from
                  whether anyone is responding. Both used to share one column,
                  so an alert nobody had seen read as DELIVERED. */}
              {sos.deliveryStatus && (
                <div>
                  <span className="text-muted-foreground">Alerts sent </span>
                  <span className="font-medium">
                    {sos.deliveryStatus === 'delivered'
                      ? 'Yes'
                      : sos.deliveryStatus === 'no_recipients_configured'
                        ? 'Nobody is set up to receive these'
                        : sos.deliveryStatus === 'partial_failure'
                          ? 'Some failed'
                          : 'Failed'}
                  </span>
                </div>
              )}
              {sos.gpsLatitude != null && sos.gpsLongitude != null && (
                <div>
                  <span className="text-muted-foreground">Position </span>
                  <a
                    href={`https://www.google.com/maps?q=${sos.gpsLatitude},${sos.gpsLongitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    {sos.gpsLatitude.toFixed(5)}, {sos.gpsLongitude.toFixed(5)}
                  </a>
                </div>
              )}
            </div>
            <div className="rounded-lg bg-background/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Reason: </span>
              <span className="font-medium">{sos.reason}</span>
            </div>
            {/* Forward only. An alert nobody has claimed looks different from
                one somebody is already driving to, and the control room needs
                to be able to tell them apart at a glance. */}
            <div className="flex flex-wrap gap-2">
              {(['acknowledged', 'responding', 'resolved'] as const)
                .filter((step) => {
                  const order = ['triggered', 'acknowledged', 'responding', 'resolved']
                  return order.indexOf(step) > order.indexOf(sos.status)
                })
                .map((step) => (
                  <button
                    key={step}
                    onClick={async () => {
                      setResolvingEmergency(sos.id)
                      try {
                        await api.emergency.setStatus(sos.id, step)
                        if (step === 'resolved') {
                          setEmergencies((prev) => prev.filter((e) => e.id !== sos.id))
                        } else {
                          await loadAlerts()
                        }
                      } finally {
                        setResolvingEmergency(null)
                      }
                    }}
                    disabled={resolvingEmergency === sos.id}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                      step === 'resolved'
                        ? 'bg-destructive text-destructive-foreground hover:opacity-90'
                        : 'border border-destructive/40 text-destructive hover:bg-destructive/10'
                    }`}
                  >
                    {step === 'acknowledged'
                      ? 'Acknowledge'
                      : step === 'responding'
                        ? 'Responding'
                        : 'Mark resolved'}
                  </button>
                ))}
            </div>
          </div>
        </div>
      ))}

      {/* Guard observations. Deliberately above the incident list: a note
          about a dead gate light is cheap to action and easy to lose in a
          page of incidents. Acknowledging one clears it from this view. */}
      {observations.length > 0 && (
        <div className="rounded-xl border border-info/25 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-info" />
            <h2 className="font-semibold">Guard observations</h2>
            <span className="rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-semibold text-info">
              {observations.length}
            </span>
          </div>
          <div className="space-y-2">
            {observations.map((note) => (
              <div key={note.id} className="flex flex-wrap items-start gap-3 rounded-lg bg-muted/30 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{note.message}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {note.officerName && <span>{note.officerName}</span>}
                    {(note.checkpointName || note.siteName) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {note.checkpointName ?? note.siteName}
                      </span>
                    )}
                    {note.clientName && <span>{note.clientName}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {formatDate(note.createdAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setAckingObservation(note.id)
                    try {
                      await api.observations.acknowledge(note.id)
                      setObservations((prev) => prev.filter((n) => n.id !== note.id))
                    } finally {
                      setAckingObservation(null)
                    }
                  }}
                  disabled={ackingObservation === note.id}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {ackingObservation === note.id ? 'Saving…' : 'Mark done'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, officer or checkpoint..."
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All types</option>
          <option value="incidents">Incidents</option>
          <option value="missed">Missed patrols</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        // Matches the skeleton treatment used by the other list pages, so
        // loading looks the same wherever you are in the dashboard.
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (filteredMissed.length > 0 || filteredIncidents.length > 0) ? (
        <div className="space-y-3">
          {filteredMissed.map((mp, i) => {
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
          {filteredIncidents.map((inc) => {
            const Icon = severityIcon[inc.severity] || Info
            const color = severityColor[inc.severity]
            const expanded = expandedId === inc.id
            const photos = (inc.photoUrls ?? [])
              .map((url) => photoSrc(url))
              .filter((url): url is string => !!url)
            const hasCoords = inc.latitude != null && inc.longitude != null
            const locationLabel = [inc.checkpointName, inc.siteName].filter(Boolean).join(' — ')
            return (
              <div
                key={inc.id}
                onClick={() => setExpandedId(expanded ? null : inc.id)}
                className="rounded-xl border border-border bg-card p-4 flex items-start gap-3 cursor-pointer transition-colors hover:border-primary/40"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{inc.title}</div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${color}`}>
                        {inc.severity}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User2 className="h-3 w-3" /> {inc.officerName}
                    </span>
                    {locationLabel && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {locationLabel}
                      </span>
                    )}
                    {photos.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Camera className="h-3 w-3" /> {photos.length} photo{photos.length > 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDate(inc.reportedAt)}
                    </span>
                    <span className={`uppercase ${inc.status === 'resolved' ? 'text-success' : 'text-warning'}`}>
                      {inc.status}
                    </span>
                  </div>
                  {!expanded && inc.description && (
                    <div className="mt-2 text-sm text-muted-foreground line-clamp-2">{inc.description}</div>
                  )}

                  {expanded && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-border bg-background/60 p-3">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Category</div>
                          <div className="mt-1 text-sm font-medium">{inc.category || 'Security Incident'}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background/60 p-3">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Location</div>
                          <div className="mt-1 text-sm font-medium">
                            {locationLabel || 'No checkpoint attached'}
                          </div>
                          {hasCoords && (
                            <a
                              href={`https://www.google.com/maps?q=${inc.latitude},${inc.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {inc.latitude!.toFixed(5)}, {inc.longitude!.toFixed(5)} — open in Maps
                            </a>
                          )}
                        </div>
                      </div>

                      {inc.description && (
                        <div className="rounded-lg border border-border bg-background/60 p-3">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Description</div>
                          <div className="mt-1 whitespace-pre-wrap text-sm">{inc.description}</div>
                        </div>
                      )}

                      {photos.length > 0 && (
                        <div>
                          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Photos</div>
                          <div className="flex flex-wrap gap-2">
                            {photos.map((url) => (
                              <button
                                key={url}
                                onClick={() => setPhotoPreview(url)}
                                className="h-24 w-24 overflow-hidden rounded-lg border border-border hover:opacity-80"
                              >
                                <img src={url} alt="Incident photo" className="h-full w-full object-cover" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {inc.status !== 'resolved' && (
                        <button
                          onClick={() => handleAcknowledge(inc.id)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
                        >
                          Acknowledge & Resolve
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          {incidents.length > 0 || missedPatrols.length > 0
            ? 'No alerts match your filters.'
            : 'No alerts at this time'}
        </div>
      )}

      {photoPreview && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPhotoPreview(null)}
        >
          <img
            src={photoPreview}
            alt="Incident photo"
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  )
}
