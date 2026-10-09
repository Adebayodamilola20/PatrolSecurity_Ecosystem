import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageSquare, Loader2, X, Send } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { CardSkeleton, LoadingNote } from '../components/ui/Skeleton'
import { formatDate } from '../utils/format'
import { PageHeader } from '../components/ui/PageHeader'
import type { ClientPassOn, ClientSiteDetail } from '../types'

/**
 * Pass-ons: instructions this account writes for the guards on its own sites.
 *
 * Everything else in this portal flows inward — the client reads what the
 * guards did. This is the one screen that flows outward, so it is deliberately
 * plain: say it, say where, say who, send.
 */
export default function PassOns() {
  const fetcher = useCallback(() => api.passOns.list(), [])
  const { data, loading, error, reload } = useClientData(fetcher)

  const [showForm, setShowForm] = useState(false)
  const [sites, setSites] = useState<ClientSiteDetail[]>([])
  const [form, setForm] = useState({
    title: '',
    instruction: '',
    siteId: '',
    checkpointId: '',
  })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Locations and the addressable roster are only needed once the form opens.
  useEffect(() => {
    if (!showForm) return
    void api.sites.list().then((res) => setSites(res.sites)).catch(() => setSites([]))
  }, [showForm])

  const subLocations = useMemo(() => {
    const site = sites.find((s) => s.id === form.siteId)
    return site?.subLocations ?? []
  }, [sites, form.siteId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setSendError(null)
    try {
      await api.passOns.create({
        title: form.title,
        instruction: form.instruction,
        siteId: form.siteId || undefined,
        checkpointId: form.checkpointId || undefined,
        requiresAcknowledgement: true,
      })
      setShowForm(false)
      setForm({ title: '', instruction: '', siteId: '', checkpointId: '' })
      void reload()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send this pass-on.')
    } finally {
      setSending(false)
    }
  }

  const rows = useMemo(
    () => [...(data ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [data],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pass-ons"
        blurb="Instructions your guards see on their phones and have to acknowledge."
        actions={
          <button
            onClick={() => { setShowForm(true); setSendError(null) }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Send className="h-4 w-4" /> New pass-on
          </button>
        }
      />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New pass-on</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block text-xs text-muted-foreground">
              Subject
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Extra patrol tonight"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>

            <label className="block text-xs text-muted-foreground">
              Message
              <textarea
                required
                value={form.instruction}
                onChange={(e) => setForm({ ...form, instruction: e.target.value })}
                placeholder="What do the guards need to know or do?"
                className="mt-1 min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-muted-foreground">
                Location
                <select
                  value={form.siteId}
                  onChange={(e) => setForm({ ...form, siteId: e.target.value, checkpointId: '' })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">All my locations</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Sub-location (optional)
                <select
                  value={form.checkpointId}
                  onChange={(e) => setForm({ ...form, checkpointId: e.target.value })}
                  disabled={!form.siteId}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                >
                  <option value="">{form.siteId ? 'Anywhere on this location' : 'Pick a location first'}</option>
                  {subLocations.map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {sendError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {sendError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">
                Cancel
              </button>
              <button disabled={sending} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending…' : 'Send to guards'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <LoadingNote label="Loading pass-ons…" />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No pass-ons yet"
          description="Send one and it appears on the phones of the guards posted at that location."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row: ClientPassOn) => (
            <div key={row.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{row.title}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{row.instruction}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{row.checkpointName ?? row.siteName ?? row.siteLabel ?? 'All locations'}</span>
                <span>· from {row.createdByName}</span>
                {!row.active && <span className="text-warning">· withdrawn</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
