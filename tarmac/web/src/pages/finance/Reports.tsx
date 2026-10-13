import { useState } from 'react'
import { Download } from 'lucide-react'
import { finance, type Reports } from '../../services/finance'
import { dateLabel, downloadCsv, monthOptions, naira, nairaPlain, thisPeriod } from './format'
import {
  Btn, Empty, Failed, Loading, Page, Panel, Row, Rows, SelectInput,
} from './ui'
import { useData } from './hooks'

const REPORTS: { title: string; text: string; make: (r: Reports) => (string | number)[][] }[] = [
  {
    title: 'Money by branch',
    text: 'What each branch received, and how it was shared.',
    make: (r) => [
      ['Branch', 'Payments', 'Received', 'On hold', 'Head Office', 'VAT', 'Partner', 'Salaries'],
      ...r.byBranch.map((b) => [b.branchName, b.payments, nairaPlain(b.receivedKobo), nairaPlain(b.heldKobo), nairaPlain(b.split.hq), nairaPlain(b.split.vat), nairaPlain(b.split.partner), nairaPlain(b.split.salary)]),
    ],
  },
  {
    title: 'Money owed by clients',
    text: 'Every unpaid invoice, the most late first.',
    make: (r) => [
      ['Invoice', 'Client', 'Branch', 'Due date', 'Days late', 'Still to pay'],
      ...r.owed.map((o) => [o.number, o.clientName, o.branchName, o.dueDate, o.daysLate, nairaPlain(o.balanceKobo)]),
    ],
  },
  {
    title: 'Payroll summary',
    text: 'Pay, PAYE and pension per branch, for paying the tax office and pension.',
    make: (r) => [
      ['Branch', 'Status', 'People', 'Gross pay', 'PAYE', 'Pension (staff 8%)', 'Pension (Tarmac 10%)', 'Housing fund', 'Take-home'],
      ...r.payroll.map((p) => [p.branchName, p.status === 'none' ? 'not prepared' : p.status, p.people, nairaPlain(p.totals.gross), nairaPlain(p.totals.paye), nairaPlain(p.totals.pension), nairaPlain(p.totals.employerPension), nairaPlain(p.totals.nhf), nairaPlain(p.totals.net)]),
    ],
  },
  {
    title: 'VAT set aside',
    text: 'The 7.5% VAT share kept from each branch, ready to pay to FIRS.',
    make: (r) => [['Branch', 'VAT set aside'], ...r.byBranch.map((b) => [b.branchName, nairaPlain(b.split.vat)]), ['Total', nairaPlain(r.byBranch.reduce((s, b) => s + b.split.vat, 0))]],
  },
]

export default function FinanceReports() {
  const [period, setPeriod] = useState(thisPeriod())
  const { data, error, loading, reload } = useData(() => finance.reports(period), [period])

  return (
    <Page
      title="Reports"
      help="Monthly figures to download and open in Excel."
      action={<div className="w-56"><SelectInput value={period} onChange={setPeriod} options={monthOptions()} /></div>}
    >
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && (
        <>
          <Panel>
            <Rows>
              {REPORTS.map((r) => (
                <div key={r.title} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div className="text-base font-semibold">{r.title}</div>
                    <div className="text-[15px] text-muted-foreground">{r.text}</div>
                  </div>
                  <Btn variant="secondary" onClick={() => downloadCsv(`${r.title.toLowerCase().replace(/\s+/g, '-')}-${data.period}.csv`, r.make(data))}>
                    <Download className="h-4 w-4" /> Download
                  </Btn>
                </div>
              ))}
            </Rows>
          </Panel>

          <Panel title={`${data.periodLabel} by branch`}>
            {data.byBranch.length === 0 ? (
              <Empty title="No branches yet" />
            ) : (
              <Rows>
                {data.byBranch.map((b) => (
                  <Row
                    key={b.branchName}
                    title={b.branchName}
                    sub={`Head Office ${naira(b.split.hq)} · Partner ${naira(b.split.partner)} · Salaries ${naira(b.split.salary)}`}
                    right={naira(b.receivedKobo)}
                    rightSub={b.heldKobo ? `${naira(b.heldKobo)} on hold` : `${b.payments} payment${b.payments === 1 ? '' : 's'}`}
                  />
                ))}
              </Rows>
            )}
          </Panel>

          {data.owed.length > 0 && (
            <Panel title="Still owed by clients">
              <Rows>
                {data.owed.slice(0, 10).map((o) => (
                  <Row
                    key={o.number}
                    title={o.clientName}
                    sub={`${o.number} · due ${dateLabel(o.dueDate)}${o.daysLate ? ` · ${o.daysLate} days late` : ''}`}
                    right={naira(o.balanceKobo)}
                  />
                ))}
              </Rows>
            </Panel>
          )}
        </>
      )}
    </Page>
  )
}
