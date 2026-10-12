import { Check, Download } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { PAYROLL } from './sample'
import { Button, Figures, SampleBanner, Section, Select, Table, Td } from './ui'
import { cx, naira, nairaShort } from './format'

const STEPS = ['Draft', 'Approved', 'Paid']

export default function FinancePayroll() {
  const gross = PAYROLL.reduce((s, r) => s + r.gross, 0)
  const pension = PAYROLL.reduce((s, r) => s + r.pension, 0)
  const paye = PAYROLL.reduce((s, r) => s + r.paye, 0)
  const net = PAYROLL.reduce((s, r) => s + r.net, 0)
  // What the branch pays out: gross pay plus Tarmac's 10% employer pension.
  const branchPayroll = gross + Math.round(PAYROLL.reduce((s, r) => s + r.basic, 0) * 0.1)
  const salaryAccount = 940_000
  const step = 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Payroll"
        blurb="Monthly salaries for each branch, paid from that branch's salary account, with tax and pension worked out for every person."
        actions={
          <>
            <Select options={['Jos branch', 'Abuja branch', 'Lagos branch', 'Port Harcourt branch', 'Owerri branch', 'Yola branch', 'Lafia branch']} />
            <Select options={['October 2026', 'September 2026', 'August 2026']} />
          </>
        }
      />
      <SampleBanner />

      <Section title="Jos branch · October 2026">
        <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <ol className="flex items-center gap-2 text-sm">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span
                  className={cx(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                    i < step && 'bg-primary text-primary-foreground',
                    i === step && 'border-2 border-primary text-primary',
                    i > step && 'bg-muted text-muted-foreground',
                  )}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cx(i === step ? 'font-semibold' : 'text-muted-foreground')}>{s}</span>
                {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline"><Download className="h-4 w-4" /> Payslips</Button>
            <Button variant="outline"><Download className="h-4 w-4" /> Bank schedule</Button>
            <Button>Send for approval</Button>
          </div>
        </div>
        <div className="border-t border-border px-4 py-3 text-sm sm:px-5">
          <span className="text-muted-foreground">Salary account balance </span>
          <span className="font-semibold tabular-nums">{naira(salaryAccount)}</span>
          <span className="text-muted-foreground"> covers this month's payroll of </span>
          <span className="font-semibold tabular-nums">{naira(branchPayroll)}</span>
          <span className="ml-2 font-medium text-success">· {naira(salaryAccount - branchPayroll)} left over</span>
        </div>
      </Section>

      <Figures
        items={[
          { label: 'Gross pay', value: nairaShort(gross), note: `${PAYROLL.length} people shown` },
          { label: 'Pension (8%)', value: nairaShort(pension), note: 'Plus 10% from Tarmac' },
          { label: 'PAYE tax', value: nairaShort(paye) },
          { label: 'Take-home pay', value: nairaShort(net) },
        ]}
      />

      <Section title="Pay this month">
        <Table
          head={[
            { label: 'Name' },
            { label: 'Basic', align: 'right' },
            { label: 'Allowances', align: 'right' },
            { label: 'Gross', align: 'right' },
            { label: 'Pension', align: 'right' },
            { label: 'PAYE', align: 'right' },
            { label: 'Take-home', align: 'right' },
          ]}
        >
          {PAYROLL.map((r) => (
            <tr key={r.name} className="hover:bg-muted/40">
              <Td>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.role}</div>
              </Td>
              <Td align="right" muted>{naira(r.basic)}</Td>
              <Td align="right" muted>{naira(r.allowances)}</Td>
              <Td align="right">{naira(r.gross)}</Td>
              <Td align="right" muted>−{naira(r.pension)}</Td>
              <Td align="right" muted>{r.paye ? `−${naira(r.paye)}` : '—'}</Td>
              <Td align="right" strong>{naira(r.net)}</Td>
            </tr>
          ))}
          <tr className="bg-muted/40 font-semibold">
            <Td>Total</Td>
            <Td align="right">{naira(PAYROLL.reduce((s, r) => s + r.basic, 0))}</Td>
            <Td align="right">{naira(PAYROLL.reduce((s, r) => s + r.allowances, 0))}</Td>
            <Td align="right">{naira(gross)}</Td>
            <Td align="right">−{naira(pension)}</Td>
            <Td align="right">−{naira(paye)}</Td>
            <Td align="right">{naira(net)}</Td>
          </tr>
        </Table>
      </Section>
    </div>
  )
}
