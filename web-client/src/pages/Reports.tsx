import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Download, Loader2, Eye, X } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import { markReportsSeen } from '../hooks/useUnreadReports'
import EmptyState from '../components/ui/EmptyState'
import { ListSkeleton, LoadingNote } from '../components/ui/Skeleton'
import { formatDate } from '../utils/format'

// "location-verification" → "Location Verification"
const categoryLabel = (type: string) =>
  type.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function Reports() {
  const fetcher = useCallback(() => api.reports.list(), [])
  const { data, loading, error } = useClientData(fetcher)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [category, setCategory] = useState('all')

  // In-browser A4 preview.
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)

  // Capture what counted as "seen" BEFORE this visit so we can flag the new
  // rows, then mark everything seen so the sidebar badge clears.
  const [seenBefore] = useState(() => Number(localStorage.getItem('reports_last_seen') || 0))
  useEffect(() => {
    if (data) markReportsSeen()
  }, [data])

  const categories = useMemo(() => {
    const set = new Set((data ?? []).map((r) => r.type))
    return Array.from(set).sort()
  }, [data])

  const rows = useMemo(() => {
    const list = (data ?? []).filter((r) => category === 'all' || r.type === category)
    return [...list].sort((a, b) => b.submittedAt - a.submittedAt)
  }, [data, category])

  const openPreview = async (id: string, title: string) => {
    setPreviewing(id)
    setDownloadError(null)
    try {
      const blob = await api.reports.pdf(id)
      setPreview({ url: URL.createObjectURL(blob), title })
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Could not open preview')
    } finally {
      setPreviewing(null)
    }
  }

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  // The PDF endpoint needs the session token, so a plain link won't do:
  // fetch it authenticated, then hand the file to the browser.
  const downloadPdf = async (id: string, title: string) => {
    setDownloading(id)
    setDownloadError(null)
    try {
      const blob = await api.reports.pdf(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title.replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '') || 'report'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Download patrol &amp; incident reports for your sites.</p>
        </div>
        {categories.length > 0 ? (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        ) : null}
      </div>

      {downloadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {downloadError}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <LoadingNote label="Loading reports…" />
          <ListSkeleton rows={5} />
        </div>
      ) : error ? (
        <EmptyState icon={FileText} title="Couldn't load reports" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="No reports yet" description="Reports for your sites will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  <span className="truncate">{r.title}</span>
                  {r.submittedAt > seenBefore ? (
                    <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      New
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="text-primary">{categoryLabel(r.type)}</span> · {formatDate(new Date(r.submittedAt))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => void openPreview(r.id, r.title)}
                  disabled={previewing === r.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                >
                  {previewing === r.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  Preview
                </button>
                <button
                  onClick={() => void downloadPdf(r.id, r.title)}
                  disabled={downloading === r.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                >
                  {downloading === r.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4" onClick={closePreview}>
          <div
            className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="truncate text-sm font-medium">{preview.title}</p>
              <button onClick={closePreview} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe title="Report preview" src={preview.url} className="h-full w-full flex-1 bg-white" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
