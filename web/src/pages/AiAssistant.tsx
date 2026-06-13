import { Bot, Database, FileText, LockKeyhole, ShieldCheck } from 'lucide-react'
import AiAssistantPanel from '../components/AiAssistantPanel'

const capabilities = [
  { label: 'Live operations', icon: Database },
  { label: 'Report drafts', icon: FileText },
  { label: 'Role scoped', icon: LockKeyhole },
  { label: 'Verified data', icon: ShieldCheck },
]

export default function AiAssistant() {
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
