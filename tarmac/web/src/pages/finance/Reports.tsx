import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { BRANCHES, splitOf } from './sample'
import { SampleBanner, Section, Select, Table, Td } from './ui'
import { naira } from './format'

const REPORTS = [
  { title: 'Branch statement', text: 'Everything a branch was paid, shared and spent in the month. For branch partners.' },
  { title: 'Head Office income', text: "Head Office's 8% from every branch, month by month." },
  { title: 'VAT set aside', text: 'VAT collected in each branch, ready to pay to FIRS.' },
  { title: 'Salary account vs payroll', text: 'Whether each branch salary account had enough to cover its payroll.' },
  { title: 'Money owed by clients', text: 'Unpaid invoices grouped by how late they are.' },
  { title: 'Payroll summary', text: 'Gross pay, PAYE and pension per branch, for remittance.' },
]

export default function FinanceReports() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Finance Reports"
        blurb="Monthly statements for Head Office, branch partners and the tax office, ready to download."
        actions={<Select options={['October 2026', 'September 2026', 'August 2026', 'Quarter 3 2026']} />}
      />
      <SampleBanner />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <article key={r.title} className="flex flex-col rounded-lg border border-border bg-card p-4 sm:p-5">
            <h2 className="font-semibold">{r.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{r.text}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                <FileText className="h-3.5 w-3.5" /> PDF
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </button>
            </div>
          </article>
        ))}
      </div>

      <Section
        title="October 2026 by branch"
        action={
          <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        }
      >
        <Table
          head={[
            { label: 'Branch' },
            { label: 'Collected', align: 'right' },
            { label: 'Head Office', align: 'right' },
            { label: 'VAT set aside', align: 'right' },
            { label: 'Partner', align: 'right' },
            { label: 'Salaries', align: 'right' },
          ]}
        >
          {BRANCHES.map((b) => {
            const s = splitOf(b.collected)
            return (
              <tr key={b.id} className="hover:bg-muted/40">
                <Td strong>{b.name}</Td>
                <Td align="right" strong>{naira(b.collected)}</Td>
                <Td align="right" muted>{naira(s.hq)}</Td>
                <Td align="right" muted>{naira(s.vat)}</Td>
                <Td align="right" muted>{naira(s.partner)}</Td>
                <Td align="right" muted>{naira(s.salary)}</Td>
              </tr>
            )
          })}
          {(() => {
            const total = BRANCHES.reduce((s, b) => s + b.collected, 0)
            const s = splitOf(total)
            return (
              <tr className="bg-muted/40 font-semibold">
                <Td>All branches</Td>
                <Td align="right">{naira(total)}</Td>
                <Td align="right">{naira(s.hq)}</Td>
                <Td align="right">{naira(s.vat)}</Td>
                <Td align="right">{naira(s.partner)}</Td>
                <Td align="right">{naira(s.salary)}</Td>
              </tr>
            )
          })()}
        </Table>
      </Section>
    </div>
  )
}
