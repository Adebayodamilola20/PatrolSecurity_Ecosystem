import { Plus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { PARTNERS } from './sample'
import { Button, Figures, Initials, Pill, SampleBanner, Section, Table, Td } from './ui'
import { naira, nairaShort } from './format'

export default function FinancePartners() {
  const paid = PARTNERS.reduce((s, p) => s + p.paidThisMonth, 0)
  const pending = PARTNERS.filter((p) => p.status === 'pending_approval')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Partners"
        blurb="Branch partners receive 34.5% of every payment their branch's clients make, straight into their bank account."
        actions={<Button><Plus className="h-4 w-4" /> Add partner</Button>}
      />
      <SampleBanner />

      <Figures
        items={[
          { label: 'Partners', value: String(PARTNERS.length) },
          { label: 'Paid to partners this month', value: nairaShort(paid) },
          { label: 'Partner share', value: '34.5%', note: 'Of each payment' },
          { label: 'Waiting for approval', value: String(pending.length), tone: pending.length ? 'amber' : undefined },
        ]}
      />

      {pending.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <div className="font-medium">
            {pending.map((p) => p.name).join(', ')} {pending.length === 1 ? 'was' : 'were'} added and need a second Head Office approval.
          </div>
          <p className="mt-1 text-muted-foreground">
            No money goes to a new partner, or to a changed bank account, until a second person at Head Office approves it.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Review and approve</button>
          </div>
        </div>
      )}

      <Section title="All partners">
        <Table
          head={[
            { label: 'Partner' },
            { label: 'Branch' },
            { label: 'Bank account' },
            { label: 'Paid this month', align: 'right' },
            { label: 'Status' },
          ]}
        >
          {PARTNERS.map((p) => (
            <tr key={p.name} className="hover:bg-muted/40">
              <Td>
                <div className="flex items-center gap-3">
                  <Initials name={p.name} />
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">Partner since {p.since}</div>
                  </div>
                </div>
              </Td>
              <Td>{p.branch}</Td>
              <Td>
                <div className="font-mono text-[13px]">{p.account}</div>
                <div className="text-xs text-muted-foreground">{p.bank}</div>
              </Td>
              <Td align="right" strong>{naira(p.paidThisMonth)}</Td>
              <Td>{p.status === 'active' ? <Pill tone="green">Receiving</Pill> : <Pill tone="amber">Needs approval</Pill>}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  )
}
