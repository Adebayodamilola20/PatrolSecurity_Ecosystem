import { useCallback } from 'react'
import { FileText, Download } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { formatDate } from '../utils/format'

export default function Reports() {
  const fetcher = useCallback(() => api.reports.list(), [])
  const { data, loading, error } = useClientData(fetcher)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Download patrol & incident reports for your sites.</p>
      </div>

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
                  {r.type} · {formatDate(new Date(r.submittedAt))}
                </p>
              </div>
              <a
                href={api.reports.pdfUrl(r.id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" /> PDF
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
