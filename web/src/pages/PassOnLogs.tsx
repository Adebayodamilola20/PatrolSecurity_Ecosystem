import { useEffect, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { api } from '../services/api'
import type { PassOnLog } from '../types'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { formatDate } from '../utils/format'

export default function PassOnLogs() {
  const [logs, setLogs] = useState<PassOnLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    instruction: '',
    priority: 'normal',
    siteLabel: '',
    checkpointId: '',
    requiresAcknowledgement: true,
  })

  const load = async () => {
    setLoading(true)
    try {
      setLogs(await api.passOnLogs.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const createLog = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.passOnLogs.create({
        ...form,
        checkpointId: form.checkpointId || null,
      })
      setShowForm(false)
      setForm({ title: '', instruction: '', priority: 'normal', siteLabel: '', checkpointId: '', requiresAcknowledgement: true })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const priorityColor = (p: string) => {
    if (p === 'critical') return 'bg-destructive/15 text-destructive'
    if (p === 'urgent') return 'bg-warning/15 text-warning'
    return 'bg-muted text-muted-foreground'
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Operations</div>
          <h1 className="text-2xl font-semibold">Pass-On Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">One-off instructions that officers must acknowledge before scanning.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> New Pass-On Log
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={createLog} className="w-full max-w-xl rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create Pass-On Log</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Instruction title *" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <textarea required value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} placeholder="Detailed instruction *" className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critical</option>
              </select>
              <input value={form.siteLabel} onChange={(e) => setForm({ ...form, siteLabel: e.target.value })} placeholder="Site / location" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.requiresAcknowledgement} onChange={(e) => setForm({ ...form, requiresAcknowledgement: e.target.checked })} />
              Requires acknowledgement (blocks scanning until acknowledged)
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button disabled={saving || !form.title || !form.instruction} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                {saving ? 'Saving...' : 'Create Log'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="No pass-on logs yet"
          description="Create instructions that officers can acknowledge before starting patrols."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${priorityColor(log.priority)}`}>
                      {log.priority}
                    </span>
                    <div className="text-lg font-semibold truncate">{log.title}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm whitespace-pre-wrap">{log.instruction}</div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>By: <span className="text-foreground font-medium">{log.createdByName || 'Unknown'}</span></span>
                <span>Site: <span className="text-foreground">{log.siteLabel || 'General'}</span></span>
                <span>Requires ack: <span className="text-foreground">{log.requiresAcknowledgement ? 'Yes' : 'No'}</span></span>
                <span>Created: <span className="text-foreground">{formatDate(log.createdAt)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
