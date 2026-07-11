import { useEffect, useState } from 'react'
import { FileText, Download, Mail, Calendar, Plus, X, FileBarChart, Loader2 } from 'lucide-react'
import { api, apiFileUrl } from '../services/api'
import type { ExportFile, Report } from '../types'
import { TableSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

const statusColor: Record<string, string> = {
  sent: 'bg-success/15 text-success',
  submitted: 'bg-success/15 text-success',
  generating: 'bg-primary/15 text-primary',
  pending: 'bg-warning/15 text-warning',
  failed: 'bg-destructive/15 text-destructive',
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([])
  const [exports, setExports] = useState<ExportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)
  const [requestingExport, setRequestingExport] = useState(false)
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10))
  const [form, setForm] = useState({ clientEmail: '', periodStart: '', periodEnd: '' })
  const [exportError, setExportError] = useState<string | null>(null)

  const loadData = async () => {
    const [result, exportList] = await Promise.all([
      api.reports.list(),
      api.scans.listDailyExports(),
    ])
    // The API returns { reports, submissions }: submissions are the reports
    // guards actually file from the app — fold them into one list.
    const submissions = (result?.submissions ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      type: s.type,
      userName: s.userName,
      status: s.status,
      createdAt: s.submittedAt,
    }))
    setReports([...(result?.reports ?? []), ...submissions])
    setExports(exportList)
  }

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))
  }, [])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenerating(true)
    try {
      await api.reports.generate({
        clientEmail: form.clientEmail,
        periodStart: form.periodStart || new Date(Date.now() - 7 * 86400000).toISOString(),
        periodEnd: form.periodEnd || new Date().toISOString(),
      })
      setShowForm(false)
      setForm({ clientEmail: '', periodStart: '', periodEnd: '' })
      await loadData()
    } catch {}
    setGenerating(false)
  }

  // Authenticated fetch → browser download; a plain link can't carry the token.
  const handleDownloadPdf = async (id: string) => {
    setDownloadingPdf(id)
    try {
      const blob = await api.reports.pdf(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // request-error toast is emitted by the api layer
    } finally {
      setDownloadingPdf(null)
    }
  }

  const handleResend = async (id: string) => {
    setResending(id)
    try {
      await api.reports.resend(id)
      await loadData()
    } catch {}
    setResending(null)
  }

  const handleRequestExport = async () => {
    if (!exportDate) return
    try {
      setExportError(null)
      setRequestingExport(true)
      const created = await api.scans.exportDaily({ date: exportDate, format: 'xlsx' })
      await loadData()
      if (created?.downloadUrl) {
        window.open(apiFileUrl(created.downloadUrl), '_blank', 'noopener,noreferrer')
      }
    } catch (err: any) {
      console.error('Excel export error:', err)
      const msg = err.response?.data?.message || err.message || 'Failed to generate Excel export'
      setExportError(msg)
    } finally {
      setRequestingExport(false)
    }
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

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Excel Export</div>
            <h2 className="mt-1 text-lg font-semibold">Daily Tour Archive</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate a real Excel workbook for patrol scans and attendance, then review it here.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="text-xs text-muted-foreground">Export date</label>
              <input
                type="date"
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleRequestExport}
              disabled={requestingExport || !exportDate}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {requestingExport ? 'Generating...' : 'Generate Excel'}
            </button>
          </div>
        </div>
        {exportError && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
            <span>{exportError}</span>
            <button onClick={() => setExportError(null)} className="text-destructive hover:opacity-80" aria-label="Clear error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Sent this month</div>
          <div className="mt-2 text-2xl font-semibold">{reports.filter(r => r.status === 'sent').length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Generating</div>
          <div className="mt-2 text-2xl font-semibold">{reports.filter(r => r.status === 'generating').length}</div>
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
        <TableSkeleton rows={3} />
      ) : exports.length === 0 ? (
        <EmptyState
          icon={<Download className="h-7 w-7" />}
          title="No Excel exports yet"
          description="Generate a daily tour workbook to start building the archive."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">Generated Excel Exports</h2>
          </div>
          <div className="divide-y divide-border">
            {exports.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {item.scopeLabel || 'Patrol Export'} · {item.date}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.fileName} · Requested by {item.requestedByName || 'Unknown'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[320px] lg:grid-cols-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Scans</div>
                    <div className="font-medium">{item.totals?.scans ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Verified</div>
                    <div className="font-medium">{item.totals?.verifiedScans ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Shifts</div>
                    <div className="font-medium">{item.totals?.shifts ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Hours</div>
                    <div className="font-medium">{item.totals?.totalShiftHours ?? 0}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor[item.status] || 'bg-primary/15 text-primary'}`}>
                    {item.status}
                  </span>
                  <a
                    href={apiFileUrl(item.downloadUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border p-2 hover:bg-accent inline-flex items-center justify-center"
                    title="Download Excel"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <div className="font-medium truncate">{r.title || `Patrol Report — ${r.clientEmail}`}</div>
                <div className="text-xs text-muted-foreground">
                  {r.id.slice(0, 8).toUpperCase()} · {(r.type || r.format || 'pdf').toUpperCase()}
                  {r.userName ? ` · ${r.userName}` : ''}
                </div>
              </div>
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
              </div>
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor[r.status]}`}>
                {r.status}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => void handleDownloadPdf(r.id)}
                  disabled={downloadingPdf === r.id}
                  className="rounded-lg border border-border p-2 hover:bg-accent disabled:opacity-50 inline-flex items-center justify-center"
                  title={downloadingPdf === r.id ? 'Preparing PDF...' : 'Download PDF'}
                >
                  {downloadingPdf === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => handleResend(r.id)}
                  disabled={resending === r.id}
                  className="rounded-lg border border-border p-2 hover:bg-accent disabled:opacity-50"
                  title={resending === r.id ? 'Resending...' : 'Resend'}
                >
                  {resending === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
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
              <button
                type="submit"
                disabled={generating}
                className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {generating ? 'Generating & Emailing...' : 'Generate & Email Report'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
