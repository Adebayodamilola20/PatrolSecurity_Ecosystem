import { LockKeyhole, Plus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { BRANCHES } from './sample'
import { Button, Figures, Pill, SampleBanner, SplitBar } from './ui'
import { naira, nairaShort } from './format'

export default function FinanceBranches() {
  const collected = BRANCHES.reduce((s, b) => s + b.collected, 0)
  const held = BRANCHES.filter((b) => b.held)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Branches"
        blurb="Each branch has its own partner, its own salary account and its own sharing rule."
        actions={<Button><Plus className="h-4 w-4" /> Add branch</Button>}
      />
      <SampleBanner />

      <Figures
        items={[
          { label: 'Branches', value: String(BRANCHES.length) },
          { label: 'Clients', value: String(BRANCHES.reduce((s, b) => s + b.clients, 0)) },
          { label: 'Collected this month', value: nairaShort(collected) },
          { label: 'Branches on hold', value: String(held.length), note: held.map((b) => b.name).join(', ') || 'None', tone: held.length ? 'amber' : undefined },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {BRANCHES.map((b) => (
          <article key={b.id} className="flex flex-col rounded-lg border border-border bg-card">
            <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">{b.name}</h2>
                <p className="text-xs text-muted-foreground">{b.isHq ? 'Head Office branch' : `Partner: ${b.partner}`}</p>
              </div>
              {b.held ? (
                <Pill tone="amber"><LockKeyhole className="mr-1 h-3 w-3" />On hold</Pill>
              ) : (
                <Pill tone="green">Sharing</Pill>
              )}
            </header>
            <dl className="grid grid-cols-3 gap-2 px-5 py-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Clients</dt>
                <dd className="font-semibold tabular-nums">{b.clients}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Guards</dt>
                <dd className="font-semibold tabular-nums">{b.guards}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Owed</dt>
                <dd className="font-semibold tabular-nums">{b.outstanding ? nairaShort(b.outstanding) : '—'}</dd>
              </div>
            </dl>
            <div className="mt-auto space-y-2 border-t border-border px-5 py-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Collected this month</span>
                <span className="font-semibold tabular-nums">{naira(b.collected)}</span>
              </div>
              <SplitBar />
              <p className="text-[11px] text-muted-foreground">HQ 8% · VAT 7.5% · Partner 34.5% · Salaries 50%</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
