import { LockKeyhole } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { PAYMENTS, splitOf } from './sample'
import { Button, Figures, Pill, SampleBanner, Section, Select, SplitBar, SplitLegend, Table, Td } from './ui'
import { naira, nairaShort } from './format'

export default function FinancePayments() {
  const shared = PAYMENTS.filter((p) => p.state === 'split')
  const held = PAYMENTS.filter((p) => p.state === 'held')
  const sharedTotal = shared.reduce((s, p) => s + p.amount, 0)
  const heldTotal = held.reduce((s, p) => s + p.amount, 0)
  const totals = splitOf(sharedTotal)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Payments"
        blurb="Every payment a client makes, and exactly where it went: Head Office, VAT, the branch partner and branch salaries."
        actions={<Select options={['This week', 'This month', 'Last month']} />}
      />
      <SampleBanner />

      <Figures
        items={[
          { label: 'Received this week', value: nairaShort(sharedTotal + heldTotal), note: `${PAYMENTS.length} payments` },
          { label: 'Shared automatically', value: nairaShort(sharedTotal), note: `${shared.length} payments` },
          { label: 'On hold', value: nairaShort(heldTotal), note: 'Waiting for release', tone: held.length ? 'amber' : undefined },
          { label: 'Failed transfers', value: '0', note: 'Nothing to retry' },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Where this week's money went">
          <div className="space-y-4 p-4 sm:p-5">
            <SplitBar height="h-3" />
            <SplitLegend amounts={totals} />
          </div>
        </Section>

        <Section title="On hold">
          {held.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Nothing is on hold.</p>
          ) : (
            <ul className="divide-y divide-border">
              {held.map((p) => (
                <li key={p.ref} className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <LockKeyhole className="mt-0.5 h-4 w-4 text-warning" />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{p.client}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.branch} branch is on hold · received {p.receivedAt}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">{naira(p.amount)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button>Release and share</Button>
                    <Button variant="outline">Keep holding</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Releasing needs a second Head Office approval.</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="All payments">
        <Table
          head={[
            { label: 'Client' },
            { label: 'Received' },
            { label: 'Amount', align: 'right' },
            { label: 'Head Office', align: 'right' },
            { label: 'VAT', align: 'right' },
            { label: 'Partner', align: 'right' },
            { label: 'Salaries', align: 'right' },
            { label: 'Status' },
          ]}
        >
          {PAYMENTS.map((p) => {
            const s = splitOf(p.amount)
            const held = p.state === 'held'
            return (
              <tr key={p.ref} className="hover:bg-muted/40">
                <Td>
                  <div className="font-medium">{p.client}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{p.ref}</div>
                </Td>
                <Td muted>{p.receivedAt}</Td>
                <Td align="right" strong>{naira(p.amount)}</Td>
                <Td align="right" muted>{held ? '—' : naira(s.hq)}</Td>
                <Td align="right" muted>{held ? '—' : naira(s.vat)}</Td>
                <Td align="right" muted>{held ? '—' : naira(s.partner)}</Td>
                <Td align="right" muted>{held ? '—' : naira(s.salary)}</Td>
                <Td>{held ? <Pill tone="amber">On hold</Pill> : <Pill tone="green">Shared</Pill>}</Td>
              </tr>
            )
          })}
        </Table>
      </Section>
    </div>
  )
}
