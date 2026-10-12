import { Plus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { CLIENTS } from './sample'
import { Button, Figures, Pill, SampleBanner, SearchBox, Section, Select, Table, Td } from './ui'
import { naira, nairaShort } from './format'

const STATUS = {
  active: <Pill tone="green">Active</Pill>,
  held: <Pill tone="amber">Payments on hold</Pill>,
  ending: <Pill tone="amber">Contract ending</Pill>,
}

export default function FinanceClients() {
  const monthly = CLIENTS.reduce((s, c) => s + c.monthlyValue, 0)
  const owed = CLIENTS.reduce((s, c) => s + c.balance, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Clients"
        blurb="Every client gets their own permanent account number. Whatever they pay into it is shared automatically."
        actions={<Button><Plus className="h-4 w-4" /> Add client</Button>}
      />
      <SampleBanner />

      <Figures
        items={[
          { label: 'Clients', value: String(CLIENTS.length), note: 'Across 7 branches' },
          { label: 'Monthly contract value', value: nairaShort(monthly), note: 'Before VAT' },
          { label: 'Guards contracted', value: String(CLIENTS.reduce((s, c) => s + c.guards, 0)) },
          { label: 'Owed to Tarmac', value: nairaShort(owed), tone: owed ? 'amber' : undefined },
        ]}
      />

      <Section
        title="All clients"
        action={
          <div className="flex gap-2">
            <Select options={['All branches', 'Jos', 'Abuja', 'Lagos', 'Port Harcourt', 'Owerri', 'Yola', 'Lafia']} />
          </div>
        }
      >
        <div className="border-b border-border p-3 sm:px-5">
          <SearchBox placeholder="Search clients or account numbers" />
        </div>
        <Table
          head={[
            { label: 'Client' },
            { label: 'Payment account' },
            { label: 'Guards', align: 'right' },
            { label: 'Monthly value', align: 'right' },
            { label: 'Owed', align: 'right' },
            { label: 'Status' },
          ]}
        >
          {CLIENTS.map((c) => (
            <tr key={c.name} className="hover:bg-muted/40">
              <Td>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.branch} · contract to {c.contractEnds}
                </div>
              </Td>
              <Td>
                <div className="font-mono text-[13px] tabular-nums">{c.accountNumber}</div>
                <div className="text-xs text-muted-foreground">{c.bankName}</div>
              </Td>
              <Td align="right">{c.guards}</Td>
              <Td align="right">{naira(c.monthlyValue)}</Td>
              <Td align="right" className={c.balance ? 'font-medium text-warning' : 'text-muted-foreground'}>
                {c.balance ? naira(c.balance) : '—'}
              </Td>
              <Td>{STATUS[c.status]}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  )
}
