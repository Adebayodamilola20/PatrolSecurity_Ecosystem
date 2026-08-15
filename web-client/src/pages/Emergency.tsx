import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Loader2, Phone, MapPin, Clock, ChevronLeft } from 'lucide-react'
import { api } from '../services/api'
import { formatDate } from '../utils/format'
import { LoadingNote } from '../components/ui/Skeleton'
import type { ClientEmergency, ClientSiteDetail } from '../types'

/**
 * The emergency screen.
 *
 * This was a red box bolted to the top of the dashboard, which was wrong twice
 * over: an alarm you raise by accident while reading your patrol numbers is a
 * real cost, and an alarm you have to scroll past to see your numbers is a
 * nuisance the moment there are two of them. It gets its own page.
 *
 * The trigger is deliberately two steps. One tap on a dashboard is how false
 * alarms happen, and a false CODE RED sends guards running and teaches
 * everyone to ignore the next one. You choose the location and say what is
 * happening — which is also the only information that makes the alert useful
 * to the person walking towards it — and then confirm.
 */
export default function Emergency() {
  const [alerts, setAlerts] = useState<ClientEmergency[]>([])
  const [sites, setSites] = useState<ClientSiteDetail[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<'idle' | 'details' | 'confirm'>('idle')
  const [siteId, setSiteId] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const rows = await api.emergency.active()
      setAlerts(rows)
    } catch {
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void api.sites.list().then((res) => setSites(res.sites)).catch(() => setSites([]))
    // An alert raised by a guard on your site has to appear without anyone
    // deciding to press refresh.
    const timer = window.setInterval(load, 15_000)
    return () => window.clearInterval(timer)
  }, [load])

  const chosenSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? null,
    [sites, siteId],
  )

  const reset = () => {
    setStep('idle')
    setSiteId('')
    setNote('')
    setError(null)
  }

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      await api.emergency.trigger({ siteId, note })
      reset()
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not raise the alarm.')
      setStep('details')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Emergency</h1>
        <p className="text-sm text-muted-foreground">
          Raise an alarm at one of your locations. The guards posted there and our control room
          are alerted immediately.
        </p>
      </div>

      {/* Live alerts first: if something is happening now, that is the only
          thing on this page worth reading. */}
      {loading ? (
        <LoadingNote label="Checking for active alerts…" />
      ) : alerts.length > 0 ? (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="overflow-hidden rounded-xl border-2 border-destructive">
              <div className="flex flex-wrap items-center gap-2 bg-destructive px-4 py-2.5 text-destructive-foreground">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <span className="text-lg font-black tracking-wide">CODE RED</span>
                <span className="text-xs font-semibold uppercase tracking-wider opacity-90">
                  {alert.source === 'client' ? 'Raised by your team' : 'Raised by a guard on site'}
                </span>
                <span className="ml-auto rounded bg-destructive-foreground/20 px-2 py-0.5 text-xs font-bold uppercase">
                  {alert.status}
                </span>
              </div>
              <div className="space-y-3 bg-destructive/5 p-4">
                <p className="font-semibold">{alert.message}</p>
                <div className="rounded-lg bg-background/70 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">What is happening: </span>
                  {alert.reason}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {alert.checkpointName ?? alert.siteName ?? 'Unknown location'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(alert.triggeredAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* The trigger. Idle state is a single deliberate button, not a form —
          nobody should be one stray click from a CODE RED. */}
      {step === 'idle' && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="mt-4 font-semibold">Need help now?</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Use this for a break-in, a fire, a medical emergency or anything needing an immediate
            response. For anything less urgent, send a pass-on instead.
          </p>
          <button
            onClick={() => { setStep('details'); setError(null) }}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-destructive px-6 py-3 text-sm font-bold uppercase tracking-wide text-destructive-foreground hover:opacity-90"
          >
            <ShieldAlert className="h-4 w-4" /> Raise an emergency
          </button>
        </div>
      )}

      {step === 'details' && (
        <form
          onSubmit={(e) => { e.preventDefault(); setStep('confirm') }}
          className="space-y-4 rounded-xl border-2 border-destructive bg-card p-5"
        >
          <div className="flex items-center gap-2">
            <button type="button" onClick={reset} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="font-semibold">Where, and what is happening?</h2>
          </div>

          <label className="block text-xs text-muted-foreground">
            Location
            <select
              required
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
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
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Break-in at the rear gate, two men on the property"
              className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              This is read by the guard walking towards it. Say what they are walking into.
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={reset} className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-accent">
              Cancel
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-destructive-foreground hover:opacity-90">
              Continue
            </button>
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div className="space-y-4 rounded-xl border-2 border-destructive bg-card p-5">
          <h2 className="font-semibold text-destructive">Send this alarm?</h2>
          <div className="space-y-2 rounded-lg bg-destructive/5 p-4 text-sm">
            <div><span className="text-muted-foreground">Location: </span><span className="font-medium">{chosenSite?.name}</span></div>
            <div><span className="text-muted-foreground">What is happening: </span><span className="font-medium">{note}</span></div>
          </div>
          <p className="text-sm text-muted-foreground">
            Every guard posted at {chosenSite?.name ?? 'this location'} and our control room will be
            alerted straight away.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setStep('details')} disabled={sending} className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-accent disabled:opacity-60">
              Back
            </button>
            <button
              onClick={() => void send()}
              disabled={sending}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-destructive-foreground hover:opacity-90 disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
              {sending ? 'Sending…' : 'Send emergency alert'}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <Phone className="mt-0.5 h-4 w-4 shrink-0" />
        This alerts your guards and our control room. It does not call the police, fire service or
        an ambulance — call them directly if you need them.
      </div>
    </div>
  )
}
