import { useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { INVOICES, VAT_RATE, invoiceTotal, type InvoiceStatus } from './sample'
import { Button, Figures, Pill, SampleBanner, SearchBox, Section, Table, Td } from './ui'
import { cx, naira, nairaShort } from './format'

const LABEL: Record<InvoiceStatus, { text: string; tone: 'neutral' | 'blue' | 'green' | 'amber' | 'red' }> = {
  draft: { text: 'Draft', tone: 'neutral' },
  sent: { text: 'Sent', tone: 'blue' },
  part_paid: { text: 'Part-paid', tone: 'amber' },
  paid: { text: 'Paid', tone: 'green' },
  overdue: { text: 'Overdue', tone: 'red' },
}

const TABS: { key: InvoiceStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'part_paid', label: 'Part-paid' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
]

export default function FinanceInvoices() {
  const [tab, setTab] = useState<InvoiceStatus | 'all'>('all')
  const rows = tab === 'all' ? INVOICES : INVOICES.filter((i) => i.status === tab)
  const billed = INVOICES.reduce((s, i) => s + invoiceTotal(i), 0)
  const received = INVOICES.reduce((s, i) => s + i.paid, 0)
  const overdue = INVOICES.filter((i) => i.status === 'overdue')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Invoices"
        blurb="Monthly bills to clients. Each one shows the client's own account number, and payments mark it paid automatically."
        actions={
          <>
            <Button variant="outline"><Download className="h-4 w-4" /> Export</Button>
            <Button><Plus className="h-4 w-4" /> New invoice</Button>
          </>
        }
      />
      <SampleBanner />

      <Figures
        items={[
          { label: 'Billed this month', value: nairaShort(billed), note: `Includes ${VAT_RATE * 100}% VAT` },
          { label: 'Received', value: nairaShort(received) },
          { label: 'Still to collect', value: nairaShort(billed - received) },
          { label: 'Overdue', value: String(overdue.length), note: 'invoices past due date', tone: overdue.length ? 'red' : undefined },
        ]}
      />

      <Section title="Invoices">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cx(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <SearchBox placeholder="Invoice number or client" />
        </div>
        <Table
          head={[
            { label: 'Invoice' },
            { label: 'Client' },
            { label: 'Period' },
            { label: 'Total (with VAT)', align: 'right' },
            { label: 'Paid', align: 'right' },
            { label: 'Due' },
            { label: 'Status' },
          ]}
        >
          {rows.map((i) => (
            <tr key={i.number} className="hover:bg-muted/40">
              <Td><span className="font-mono text-[13px] font-medium">{i.number}</span></Td>
              <Td>
                <div className="font-medium">{i.client}</div>
                <div className="text-xs text-muted-foreground">{i.branch}</div>
              </Td>
              <Td muted>{i.period}</Td>
              <Td align="right" strong>{naira(invoiceTotal(i))}</Td>
              <Td align="right" muted>{i.paid ? naira(i.paid) : '—'}</Td>
              <Td muted>{i.due}</Td>
              <Td><Pill tone={LABEL[i.status].tone}>{LABEL[i.status].text}</Pill></Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                No invoices in this group.
              </td>
            </tr>
          )}
        </Table>
      </Section>
    </div>
  )
}
