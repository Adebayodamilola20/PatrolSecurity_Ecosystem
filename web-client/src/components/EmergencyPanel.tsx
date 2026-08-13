import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, Loader2, X } from 'lucide-react'
import { api } from '../services/api'
import { formatDate } from '../utils/format'
import type { ClientEmergency, ClientSiteDetail } from '../types'

/**
 * Emergencies, both directions.
 *
 * Live alerts appear as CODE RED — solid red, its own vocabulary, nothing like
 * the rest of the portal. An emergency that looks like a notification gets
 * read like one, and the whole point is that this one does not.
 *
 * Below it, the button that calls the guards in. It asks for a reason before
 * it will send, because "help" with no sentence attached tells the guard
 * walking towards it nothing.
 */
export default function EmergencyPanel() {
  const [alerts, setAlerts] = useState<ClientEmergency[]>([])
  const [sites, setSites] = useState<ClientSiteDetail[]>([])
  const [showForm, setShowForm] = useState(false)
  const [siteId, setSiteId] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    void api.emergency.active().then(setAlerts).catch(() => setAlerts([]))
  }, [])

  useEffect(() => {
    load()
    // An emergency is the one thing on this page that must not wait for a
    // page refresh to appear.
    const timer = window.setInterval(load, 20_000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!showForm) return
    void api.sites.list().then((res) => setSites(res.sites)).catch(() => setSites([]))
  }, [showForm])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      await api.emergency.trigger({ siteId, note })
      setShowForm(false)
      setNote('')
      setSiteId('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not raise the alarm.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <div key={alert.id} className="overflow-hidden rounded-xl border-2 border-destructive bg-destructive/10">
          <div className="flex flex-wrap items-center gap-3 bg-destructive px-4 py-2 text-destructive-foreground">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span className="text-lg font-black tracking-wide">🚨 CODE RED</span>
            <span className="text-sm font-semibold uppercase tracking-wider">Emergency Alert</span>
            <span className="ml-auto text-xs font-semibold uppercase">
              {alert.source === 'client' ? 'Raised by you' : 'Raised by a guard on site'}
            </span>
          </div>
          <div className="space-y-2 p-4">
            <div className="font-semibold">{alert.message}</div>
            <div className="text-sm">
              <span className="text-muted-foreground">Reason: </span>
              {alert.reason}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{alert.checkpointName ?? alert.siteName ?? 'Unknown location'}</span>
              <span>{formatDate(alert.triggeredAt)}</span>
              <span className="uppercase">{alert.status}</span>
            </div>
          </div>
        </div>
      ))}

      {showForm ? (
        <form onSubmit={submit} className="space-y-3 rounded-xl border-2 border-destructive bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-destructive">Raise an emergency</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            This alerts the guards posted at that location and the control room straight away.
          </p>
          <label className="block text-xs text-muted-foreground">
            Location
            <select
              required
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Choose a location…</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            What is happening?
            <textarea
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Break-in at the rear gate"
              className="mt-1 min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <button
            disabled={sending}
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-destructive-foreground hover:opacity-90 disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send emergency alert'}
          </button>
        </form>
      ) : (
        <button
          onClick={() => { setShowForm(true); setError(null) }}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-destructive px-4 py-2 text-sm font-bold uppercase tracking-wide text-destructive hover:bg-destructive/10"
        >
          <ShieldAlert className="h-4 w-4" /> Emergency
        </button>
      )}
    </div>
  )
}
