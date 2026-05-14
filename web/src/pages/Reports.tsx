import { useEffect, useState } from 'react'
import { FileText, Download, Mail, Calendar, Plus, X, FileBarChart } from 'lucide-react'
import { api } from '../services/api'
import type { Report } from '../types'
import { TableSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

const statusColor: Record<string, string> = {
  sent: 'bg-success/15 text-success',
  pending: 'bg-warning/15 text-warning',
  failed: 'bg-destructive/15 text-destructive',
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ clientEmail: '', periodStart: '', periodEnd: '' })

  useEffect(() => {
    setLoading(true)
    api.reports.list().then(setReports).finally(() => setLoading(false))
  }, [])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.reports.generate({
        clientEmail: form.clientEmail,
        periodStart: form.periodStart || new Date(Date.now() - 7 * 86400000).toISOString(),
        periodEnd: form.periodEnd || new Date().toISOString(),
      })
      setShowForm(false)
      setForm({ clientEmail: '', periodStart: '', periodEnd: '' })
      const list = await api.reports.list()
      setReports(list)
    } catch {}
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Automated</div>
          <h1 className="text-2xl font-semibold">Client Reports</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Generate New
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Sent this month</div>
          <div className="mt-2 text-2xl font-semibold">{reports.filter(r => r.status === 'sent').length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="mt-2 text-2xl font-semibold">{reports.filter(r => r.status === 'pending').length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Failed</div>
          <div className="mt-2 text-2xl font-semibold">{reports.filter(r => r.status === 'failed').length}</div>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<FileBarChart className="h-7 w-7" />}
          title="No reports yet"
          description="Generate your first patrol report to send to clients."
          action={
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Generate New
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">Patrol Report — {r.clientEmail}</div>
                <div className="text-xs text-muted-foreground">
                  {r.id.slice(0, 8).toUpperCase()} · {r.format?.toUpperCase() || 'PDF'}
                </div>
              </div>
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> {new Date(r.createdAt).toLocaleDateString()}
              </div>
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor[r.status]}`}>
                {r.status}
              </span>
              <div className="flex gap-1">
                <a
                  href={api.reports.pdf(r.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border p-2 hover:bg-accent inline-flex items-center justify-center"
                  title="Download PDF"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button className="rounded-lg border border-border p-2 hover:bg-accent" title="Resend">
                  <Mail className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Generate Report</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleGenerate} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Client Email</label>
                <input required type="email" value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Period Start</label>
                  <input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Period End</label>
                  <input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <button type="submit" className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                Generate Report
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
