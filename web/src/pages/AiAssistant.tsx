import { useEffect, useState } from 'react'
import { Bot, Database, FileText, LockKeyhole, ShieldCheck } from 'lucide-react'
import AiAssistantPanel from '../components/AiAssistantPanel'
import { api } from '../services/api'

const capabilities = [
  { label: 'Live operations', icon: Database },
  { label: 'Report drafts', icon: FileText },
  { label: 'Role scoped', icon: LockKeyhole },
  { label: 'Verified data', icon: ShieldCheck },
]

function fileSafeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ai-report'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function downloadReportDoc(report: any) {
  const title = report.title || report.reportType || 'AI Operational Report'
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.45; color: #111827; }
    h1 { font-size: 20pt; margin-bottom: 8px; }
    .meta { color: #6b7280; font-size: 10pt; margin-bottom: 20px; }
    pre { white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 11pt; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Generated ${escapeHtml(report.createdAt || new Date().toISOString())}</div>
  <pre>${escapeHtml(report.content || '')}</pre>
</body>
</html>`
  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileSafeName(title)}.doc`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function AiAssistant() {
  const [reports, setReports] = useState<any[]>([])
  const [loadingReports, setLoadingReports] = useState(true)

  useEffect(() => {
    const load = () => {
      setLoadingReports(true)
      api.ai.reports()
        .then(setReports)
        .catch(() => setReports([]))
        .finally(() => setLoadingReports(false))
    }
    load()
    window.addEventListener('ai:report-saved', load)
    return () => window.removeEventListener('ai:report-saved', load)
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Operations / AI</div>
          <h1 className="text-2xl font-semibold">AI Operations Assistant</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          {capabilities.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" />
                {item.label}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AiAssistantPanel mode="page" />
        <aside className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="h-4 w-4 text-primary" />
              Assistant Rules
            </div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>Answers are based on role-scoped system records and uploaded SOP/post-order documents.</p>
              <p>Missing data is reported clearly. Sensitive AI activity is logged for audit review.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-semibold">Saved Drafts</div>
            <div className="mt-3 space-y-2">
              {loadingReports ? (
                <div className="rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground">Loading drafts...</div>
              ) : reports.length === 0 ? (
                <div className="rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground">No saved drafts yet.</div>
              ) : (
                reports.slice(0, 5).map((report) => (
                  <details key={report.id} className="rounded-lg bg-background/60 px-3 py-2 text-xs">
                    <summary className="cursor-pointer font-medium text-foreground">{report.title || report.reportType}</summary>
                    <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{report.content}</div>
                    <button
                      onClick={() => downloadReportDoc(report)}
                      className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Download .doc
                    </button>
                  </details>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-semibold">Report Types</div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground">
              {[
                'Daily Activity',
                'Patrol Summary',
                'Clock-In / Clock-Out',
                'Attendance',
                'Incident',
                'Emergency',
                'Maintenance',
                'Pass-On Log',
                'Weekly / Monthly',
                'Client Summary',
              ].map((item) => (
                <div key={item} className="rounded-lg bg-background/60 px-3 py-2">{item}</div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
