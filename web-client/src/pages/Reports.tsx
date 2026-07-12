import { useCallback, useState } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { formatDate } from '../utils/format'

// "location-verification" → "Location Verification"
const categoryLabel = (type: string) =>
  type.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function Reports() {
  const fetcher = useCallback(() => api.reports.list(), [])
  const { data, loading, error } = useClientData(fetcher)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

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
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Download patrol & incident reports for your sites.</p>
      </div>

      {downloadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {downloadError}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <EmptyState icon={FileText} title="Couldn't load reports" description={error} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={FileText} title="No reports yet" description="Reports for your sites will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="text-primary">{categoryLabel(r.type)}</span> · {formatDate(new Date(r.submittedAt))}
                </p>
              </div>
              <button
                onClick={() => void downloadPdf(r.id, r.title)}
                disabled={downloading === r.id}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
              >
                {downloading === r.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
