import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { BRANCHES, INVOICES, MONTH, PAYMENTS, PARTNERS, invoiceTotal, splitOf } from './sample'
import { Figures, Pill, SampleBanner, Section, SplitBar, SplitLegend } from './ui'
import { naira, nairaShort } from './format'

export default function FinanceOverview() {
  const collected = BRANCHES.reduce((sum, b) => sum + b.collected, 0)
  const outstanding = INVOICES.filter((i) => i.status !== 'paid' && i.status !== 'draft').reduce((s, i) => s + invoiceTotal(i) - i.paid, 0)
  const overdue = INVOICES.filter((i) => i.status === 'overdue')
  const held = PAYMENTS.filter((p) => p.state === 'held')
  const heldTotal = held.reduce((s, p) => s + p.amount, 0)
  const pendingPartners = PARTNERS.filter((p) => p.status === 'pending_approval')
  const max = Math.max(...BRANCHES.map((b) => b.collected))

  const attention = [
    ...overdue.map((i) => ({ to: '/finance/invoices', text: `${i.client} is overdue`, detail: naira(invoiceTotal(i) - i.paid), tone: 'red' as const })),
    ...held.map((p) => ({ to: '/finance/payments', text: `${p.client} payment is on hold`, detail: naira(p.amount), tone: 'amber' as const })),
    ...pendingPartners.map((p) => ({ to: '/finance/partners', text: `New partner ${p.name} needs approval`, detail: p.branch, tone: 'amber' as const })),
    { to: '/finance/payroll', text: 'Jos payroll for October is waiting for approval', detail: 'Draft', tone: 'amber' as const },
  ]

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Finance" title="Overview" blurb={`Money in, how it was shared, and what needs a decision in ${MONTH}.`} />
      <SampleBanner />

      <Figures
        items={[
          { label: 'Collected this month', value: nairaShort(collected), note: `${PAYMENTS.length} payments this week` },
          { label: 'Still owed by clients', value: nairaShort(outstanding), note: `${overdue.length} invoices overdue`, tone: overdue.length ? 'red' : undefined },
          { label: 'On hold', value: nairaShort(heldTotal), note: `${held.length} payment waiting for release`, tone: held.length ? 'amber' : undefined },
          { label: 'Next payroll', value: '31 Oct', note: 'All 7 branches' },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Section title={`How ${MONTH} was shared`}>
          <div className="space-y-4 p-4 sm:p-5">
            <div className="text-3xl font-bold tracking-tight tabular-nums">{naira(collected)}</div>
            <SplitBar height="h-3" />
            <SplitLegend amounts={splitOf(collected)} />
          </div>
        </Section>

        <Section title="Needs attention">
          <ul className="divide-y divide-border">
            {attention.map((a) => (
              <li key={a.text}>
                <Link to={a.to} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60 sm:px-5">
                  <span className={a.tone === 'red' ? 'h-2 w-2 shrink-0 rounded-full bg-destructive' : 'h-2 w-2 shrink-0 rounded-full bg-warning'} />
                  <span className="flex-1">{a.text}</span>
                  <span className="tabular-nums text-muted-foreground">{a.detail}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Collected by branch" action={<Link to="/finance/branches" className="text-xs font-medium text-primary">All branches</Link>}>
          <div className="space-y-3 p-4 sm:p-5">
            {BRANCHES.map((b) => (
              <div key={b.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{b.name}</span>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(b.collected / max) * 100}%` }} />
                </div>
                <span className="w-20 text-right tabular-nums text-muted-foreground">{nairaShort(b.collected)}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Latest payments" action={<Link to="/finance/payments" className="text-xs font-medium text-primary">All payments</Link>}>
          <ul className="divide-y divide-border">
            {PAYMENTS.slice(0, 5).map((p) => (
              <li key={p.ref} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.client}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.branch} · {p.receivedAt}
                  </div>
                </div>
                {p.state === 'held' ? <Pill tone="amber">On hold</Pill> : <Pill tone="green">Shared</Pill>}
                <span className="w-28 text-right font-semibold tabular-nums">{naira(p.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  )
}
