import { useEffect, useMemo, useState } from 'react'
import { FileText, Download, Calendar, Plus, X, Eye, Loader2, ChevronLeft, Send, CheckCircle2 } from 'lucide-react'
import { api, apiFileUrl } from '../services/api'
import type { ExportFile } from '../types'
import { TableSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { REPORT_TEMPLATES, type ReportTemplate, type TemplateField } from '../lib/reportTemplates'
import { formatDate } from '../utils/format'

interface ReportRow {
  id: string
  type: string
  title: string
  summary: string
  details: Record<string, string>
  status: string
  siteLabel: string
  clientId: string | null
  clientName: string | null
  userName: string
  submittedAt: string
}

interface ClientOption {
  id: string
  convexId?: string
  name: string
}

interface SiteOption {
  id: string
  convexId?: string
  name: string
}

const categoryLabel = (type: string) =>
  REPORT_TEMPLATES.find((t) => t.category === type)?.label ??
  type.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function Reports() {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [exports, setExports] = useState<ExportFile[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)
  const [viewing, setViewing] = useState<ReportRow | null>(null)
  // PDF preview modal: the eye button renders the actual report PDF in-app.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Send-to-client dialog.
  const [sending, setSending] = useState<ReportRow | null>(null)
  const [sendClient, setSendClient] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendError, setSendError] = useState('')

  // List filters — server-side so the archive can grow past one page.
  const [filterType, setFilterType] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // New-report modal state: pick a category, then fill its template.
  const [showForm, setShowForm] = useState(false)
  const [template, setTemplate] = useState<ReportTemplate | null>(null)
  const [formClient, setFormClient] = useState('')
  const [formSite, setFormSite] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formFields, setFormFields] = useState<Record<string, string>>({})
  const [clientSites, setClientSites] = useState<SiteOption[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Excel export card (pre-existing feature, kept as-is)
  const [requestingExport, setRequestingExport] = useState(false)
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10))
  const [exportError, setExportError] = useState<string | null>(null)

  const filterParams = useMemo(() => {
    const params: Record<string, string> = {}
    if (filterType) params.type = filterType
    if (filterClient) params.clientId = filterClient
    if (filterFrom) params.startDate = filterFrom
    if (filterTo) params.endDate = filterTo
    return params
  }, [filterType, filterClient, filterFrom, filterTo])

  const loadReports = async () => {
    const result = await api.reports.list(filterParams)
    setReports(result?.submissions ?? [])
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      loadReports(),
      api.scans.listDailyExports().then(setExports),
      api.clients.list().then(setClients),
    ]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refetch when a filter changes (initial load handles the first fetch).
  useEffect(() => {
    if (loading) return
    void loadReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterParams])

  // The location dropdown only shows the chosen client's locations.
  useEffect(() => {
    setFormSite('')
    setClientSites([])
    if (!formClient) return
    api.sites.list({ clientId: formClient }).then((sites) => setClientSites(sites ?? []))
  }, [formClient])

  const openTemplate = (t: ReportTemplate) => {
    setTemplate(t)
    setFormTitle(`${t.label} - ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`)
    // Sensible defaults: date fields start at today.
    const defaults: Record<string, string> = {}
    for (const f of t.fields) {
      if (f.type === 'date') defaults[f.key] = new Date().toISOString().slice(0, 10)
    }
    setFormFields(defaults)
    setFormError(null)
  }

  const closeForm = () => {
    setShowForm(false)
    setTemplate(null)
    setFormClient('')
    setFormSite('')
    setFormFields({})
    setFormError(null)
  }

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template) return
    if (!formClient) {
      setFormError('Choose the client this report belongs to.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.reports.create({
        category: template.category,
        clientId: formClient,
        siteId: formSite || null,
        title: formTitle,
        fields: formFields,
      })
      closeForm()
      await loadReports()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not file the report')
    } finally {
      setSaving(false)
    }
  }

  // The eye opens the report as a real PDF preview (fetched with auth, shown in
  // an iframe) rather than a plain field dump.
  const handlePreview = async (report: ReportRow) => {
    setViewing(report)
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    setPreviewLoading(true)
    try {
      const blob = await api.reports.pdf(report.id)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch {
      // request-error toast is emitted by the api layer
    } finally {
      setPreviewLoading(false)
    }
  }

  const closePreview = () => {
    setViewing(null)
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }

  const handleDownloadPdf = async (report: ReportRow) => {
    setDownloadingPdf(report.id)
    try {
      const blob = await api.reports.pdf(report.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report.title.replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '') || 'report'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // request-error toast is emitted by the api layer
    } finally {
      setDownloadingPdf(null)
    }
  }

  // Open the send dialog, pre-selecting the report's current client.
  const openSend = (report: ReportRow) => {
    setSending(report)
    setSendError('')
    const match = clients.find(
      (c) => c.convexId === report.clientId || c.name === report.clientName,
    )
    setSendClient(match?.convexId ?? match?.id ?? '')
  }

  const confirmSend = async () => {
    if (!sending) return
    if (!sendClient) { setSendError('Pick a client to send this report to.'); return }
    setSendBusy(true)
    setSendError('')
    try {
      await api.reports.send(sending.id, sendClient)
      setSending(null)
      await loadReports()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send the report.')
    } finally {
      setSendBusy(false)
    }
  }

  const handleRequestExport = async () => {
    if (!exportDate) return
    try {
      setExportError(null)
      setRequestingExport(true)
      const created = await api.scans.exportDaily({ date: exportDate, format: 'xlsx' })
      const exportList = await api.scans.listDailyExports()
      setExports(exportList)
      if (created?.downloadUrl) {
        window.open(apiFileUrl(created.downloadUrl), '_blank', 'noopener,noreferrer')
      }
    } catch (err: any) {
      setExportError(err.response?.data?.message || err.message || 'Failed to generate Excel export')
    } finally {
      setRequestingExport(false)
    }
  }

  const renderField = (field: TemplateField) => {
    const value = formFields[field.key] ?? ''
    const set = (v: string) => setFormFields((prev) => ({ ...prev, [field.key]: v }))
    const base = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'
    switch (field.type) {
      case 'textarea':
        return (
          <textarea value={value} onChange={(e) => set(e.target.value)} required={field.required}
            placeholder={field.placeholder} className={`${base} min-h-20`} />
        )
      case 'select':
        return (
          <select value={value} onChange={(e) => set(e.target.value)} required={field.required} className={base}>
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )
      default:
        return (
          <input type={field.type} value={value} onChange={(e) => set(e.target.value)}
            required={field.required} placeholder={field.placeholder} className={base} />
        )
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Operations</div>
          <h1 className="text-2xl font-semibold">Client Reports</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Report
        </button>
      </div>

      {/* New report modal: category picker → template form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6">
            {!template ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">What kind of report?</h2>
                  <button onClick={closeForm} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Each category loads its own template.</p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {REPORT_TEMPLATES.map((t) => (
                    <button key={t.category} onClick={() => openTemplate(t)}
                      className="rounded-lg border border-border bg-background/40 p-3 text-left hover:border-primary/60 hover:bg-accent">
                      <div className="font-medium">{t.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <form onSubmit={submitReport} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setTemplate(null)} className="text-muted-foreground hover:text-foreground" title="Back to categories">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h2 className="text-lg font-semibold">{template.label}</h2>
                  </div>
                  <button type="button" onClick={closeForm} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Client (report owner) *</label>
                    <select required value={formClient} onChange={(e) => setFormClient(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="">Select client…</option>
                      {clients.map((c) => <option key={c.id} value={c.convexId ?? c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Location</label>
                    <select value={formSite} onChange={(e) => setFormSite(e.target.value)} disabled={!formClient}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50">
                      <option value="">{formClient ? 'All locations' : 'Pick a client first'}</option>
                      {clientSites.map((s) => <option key={s.id} value={s.convexId ?? s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Report title</label>
                  <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {template.fields.map((field) => (
                    <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                      <label className="text-xs text-muted-foreground">
                        {field.label}{field.required ? ' *' : ''}
                      </label>
                      <div className="mt-1">{renderField(field)}</div>
                    </div>
                  ))}
                </div>

                {formError && (
                  <div className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{formError}</div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeForm} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
                  <button disabled={saving} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                    {saving ? 'Filing…' : 'File report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* PDF preview modal: renders the actual report PDF in an iframe */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closePreview}>
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div>
                <div className="text-xs uppercase tracking-wider text-primary">{categoryLabel(viewing.type)}</div>
                <h2 className="mt-1 text-lg font-semibold">{viewing.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {viewing.clientName ? `${viewing.clientName} · ` : ''}
                  {viewing.siteLabel ? `${viewing.siteLabel} · ` : ''}
                  {viewing.userName ? `by ${viewing.userName} · ` : ''}
                  {formatDate(viewing.submittedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => void handleDownloadPdf(viewing)} disabled={downloadingPdf === viewing.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {downloadingPdf === viewing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download
                </button>
                <button onClick={closePreview} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="min-h-[60vh] flex-1 bg-muted/20">
              {previewLoading ? (
                <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing preview…
                </div>
              ) : previewUrl ? (
                <iframe src={previewUrl} title={viewing.title} className="h-[70vh] w-full" />
              ) : (
                <div className="flex h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <FileText className="h-6 w-6" />
                  Couldn't load the PDF preview. Try the Download button instead.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send-to-client dialog */}
      {sending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSending(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Send report to client</h2>
                <p className="mt-1 text-xs text-muted-foreground">{sending.title}</p>
              </div>
              <button onClick={() => setSending(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              The client will receive this report in their portal as an A4 PDF. Choose which client it goes to.
            </p>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">Client</label>
            <select value={sendClient} onChange={(e) => setSendClient(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c.id} value={c.convexId ?? c.id}>{c.name}</option>)}
            </select>
            {sendError ? <p className="mt-3 text-xs text-destructive">{sendError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSending(null)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button onClick={() => void confirmSend()} disabled={sendBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                {sendBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending.status === 'sent' ? 'Re-send' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel daily-tour export (unchanged feature) */}
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
              <input type="date" value={exportDate} onChange={(e) => setExportDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <button onClick={handleRequestExport} disabled={requestingExport || !exportDate}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
              <Download className="h-4 w-4" />
              {requestingExport ? 'Generating...' : 'Generate Excel'}
            </button>
          </div>
        </div>
        {exportError && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
            <span>{exportError}</span>
            <button onClick={() => setExportError(null)} className="text-destructive hover:opacity-80" aria-label="Clear error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {exports.length > 0 && (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {exports.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.scopeLabel || 'Patrol Export'} · {item.date}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.fileName} · {item.totals?.scans ?? 0} scans · {item.totals?.verifiedScans ?? 0} verified · {item.totals?.shifts ?? 0} shifts
                  </div>
                </div>
                <a href={apiFileUrl(item.downloadUrl)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                  <Download className="h-3.5 w-3.5" /> Excel
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground">Category</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">All categories</option>
              {REPORT_TEMPLATES.map((t) => <option key={t.category} value={t.category}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Client</label>
            <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.convexId ?? c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Report archive */}
      {loading ? (
        <TableSkeleton rows={4} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-7 w-7" />}
          title="No reports found"
          description={filterType || filterClient || filterFrom || filterTo
            ? 'Nothing matches these filters — try widening them.'
            : 'File your first report with “New Report”.'}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  <span className="text-primary">{categoryLabel(r.type)}</span>
                  {r.clientName ? ` · ${r.clientName}` : ''}
                  {r.siteLabel ? ` · ${r.siteLabel}` : ''}
                  {r.userName ? ` · by ${r.userName}` : ''}
                </div>
              </div>
              {r.status === 'sent' ? (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-success">
                  <CheckCircle2 className="h-3 w-3" /> Sent
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Draft
                </span>
              )}
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> {formatDate(r.submittedAt)}
              </div>
              <div className="flex gap-1">
                <button onClick={() => void handlePreview(r)}
                  className="rounded-lg border border-border p-2 hover:bg-accent inline-flex items-center justify-center" title="Preview PDF">
                  <Eye className="h-4 w-4" />
                </button>
                <button onClick={() => void handleDownloadPdf(r)} disabled={downloadingPdf === r.id}
                  className="rounded-lg border border-border p-2 hover:bg-accent disabled:opacity-50 inline-flex items-center justify-center"
                  title={downloadingPdf === r.id ? 'Preparing PDF...' : 'Download PDF'}>
                  {downloadingPdf === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </button>
                <button onClick={() => openSend(r)}
                  className={`rounded-lg border p-2 inline-flex items-center justify-center ${
                    r.status === 'sent'
                      ? 'border-border hover:bg-accent text-muted-foreground'
                      : 'border-primary bg-primary text-primary-foreground hover:opacity-90'
                  }`}
                  title={r.status === 'sent' ? 'Re-send to a client' : 'Send to client'}>
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
