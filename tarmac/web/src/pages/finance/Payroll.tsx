import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { finance, type Payroll, type PayrollLine } from '../../services/finance'
import { downloadCsv, monthOptions, naira, nairaPlain, thisPeriod } from './format'
import {
  Btn, Empty, Facts, Failed, Loading, Modal, Notice, Page, Panel, Row, Rows, SelectInput, Stats, Status,
} from './ui'
import { useData, useFlash, useSave } from './hooks'
import { ROLE_LABEL } from './Staff'

const STATUS_TEXT: Record<Payroll['status'], { text: string; tone: 'plain' | 'wait' | 'good' }> = {
  none: { text: 'Not prepared yet', tone: 'plain' },
  draft: { text: 'Prepared — waiting for approval', tone: 'wait' },
  approved: { text: 'Approved — ready to pay', tone: 'wait' },
  paid: { text: 'Paid', tone: 'good' },
}

export default function FinancePayroll() {
  const branches = useData(() => finance.branches())
  const [picked, setBranchId] = useState('')
  const branchId = picked || branches.data?.[0]?.id || ''
  const [period, setPeriod] = useState(thisPeriod())

  const payroll = useData(async () => (branchId ? finance.payroll(branchId, period) : null), [branchId, period])
  const action = useSave()
  const { flash, node } = useFlash()
  const [slip, setSlip] = useState<PayrollLine | null>(null)
  const p = payroll.data

  const act = async (fn: () => Promise<unknown>, m: string) => {
    if (await action.run(fn)) {
      flash(m)
      void payroll.reload()
    }
  }

  const short = p ? p.salaryAvailableKobo - p.totals.cost : 0

  return (
    <Page
      title="Payroll"
      help="Monthly pay for each branch, paid from that branch's salary money. Tax and pension are worked out for every person."
      action={
        branches.data?.length ? (
          <>
            <div className="w-52"><SelectInput value={branchId} onChange={setBranchId} options={branches.data.map((b) => ({ value: b.id, label: `${b.name} branch` }))} /></div>
            <div className="w-52"><SelectInput value={period} onChange={setPeriod} options={monthOptions()} /></div>
          </>
        ) : undefined
      }
    >
      {node}
      {branches.data && branches.data.length === 0 && <Notice tone="info">Add your branches first (Branches page).</Notice>}
      {(payroll.loading || branches.loading) && !p && <Loading />}
      {payroll.error && <Failed message={payroll.error} onRetry={payroll.reload} />}
      {action.error && <Notice tone="bad" onClose={() => action.setError(null)}>{action.error}</Notice>}

      {p && (
        <>
          <Panel>
            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xl font-bold">{p.branchName} · {p.periodLabel}</div>
                  <div className="mt-1"><Status tone={STATUS_TEXT[p.status].tone}>{STATUS_TEXT[p.status].text}</Status></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(p.status === 'none' || p.status === 'draft') && p.lines.length > 0 && (
                    <Btn variant={p.status === 'none' ? 'primary' : 'secondary'} busy={action.busy} onClick={() => act(() => finance.preparePayroll(branchId, period), 'Payroll prepared from the current staff list.')}>
                      {p.status === 'none' ? 'Prepare payroll' : 'Refresh from staff list'}
                    </Btn>
                  )}
                  {p.status === 'draft' && p.runId && (
                    <Btn busy={action.busy} disabled={p.missingBank.length > 0} onClick={() => act(() => finance.approvePayroll(p.runId!), 'Payroll approved.')}>Approve payroll</Btn>
                  )}
                  {p.status === 'approved' && p.runId && (
                    <Btn
                      busy={action.busy}
                      onClick={() => window.confirm('Have the staff been paid from the bank? Mark this payroll as paid?') && act(() => finance.markPayrollPaid(p.runId!), 'Payroll marked as paid.')}
                    >
                      Mark as paid
                    </Btn>
                  )}
                </div>
              </div>

              {p.status === 'none' && p.lines.length > 0 && <p className="text-base text-muted-foreground">This is a preview from the staff list. Press <b>Prepare payroll</b> to save it.</p>}
              {p.status === 'draft' && <p className="text-base text-muted-foreground">Another Head Office admin approves it before anyone is paid. If you are the only admin, you can approve it yourself.</p>}
              {p.status === 'approved' && <p className="text-base text-muted-foreground">Download the bank list, pay everyone from the branch salary account, then press <b>Mark as paid</b>.</p>}

              {p.missingBank.length > 0 && p.status !== 'paid' && (
                <Notice tone="warn">No bank details for {p.missingBank.join(', ')}. Add them on the Staff page, then refresh.</Notice>
              )}
              {p.status !== 'paid' && p.lines.length > 0 && (
                short >= 0 ? (
                  <Notice tone="good">The branch has {naira(p.salaryAvailableKobo)} of salary money, which covers this payroll of {naira(p.totals.cost)}.</Notice>
                ) : (
                  <Notice tone="warn">The branch has {naira(Math.max(0, p.salaryAvailableKobo))} of salary money, but this payroll costs {naira(p.totals.cost)}. It is {naira(-short)} short.</Notice>
                )
              )}
            </div>
          </Panel>

          {p.lines.length > 0 && (
            <Stats
              items={[
                { label: 'Take-home pay', value: naira(p.totals.net), note: `${p.lines.length} people` },
                { label: 'Tax and pension deducted', value: naira(p.totals.paye + p.totals.pension + p.totals.nhf), note: `PAYE ${naira(p.totals.paye)} · pension ${naira(p.totals.pension)}` },
                { label: 'Total cost to the branch', value: naira(p.totals.cost), note: "Includes Tarmac's 10% pension" },
              ]}
            />
          )}

          <Panel
            title="Pay this month"
            action={
              p.lines.length > 0 && p.status !== 'none' ? (
                <div className="flex gap-2">
                  <Btn variant="quiet" onClick={() => bankList(p)}><Download className="h-4 w-4" /> Bank list</Btn>
                  <Btn variant="quiet" onClick={() => printSlips(p, p.lines)}><Printer className="h-4 w-4" /> Payslips</Btn>
                </div>
              ) : undefined
            }
          >
            {p.lines.length === 0 ? (
              <Empty title="Nobody to pay" text={`${p.branchName} has no working staff. Add staff on the Staff page.`} />
            ) : (
              <Rows>
                {p.lines.map((l) => (
                  <Row
                    key={l.staffId}
                    title={l.name}
                    sub={`${l.staffNo} · ${ROLE_LABEL[l.role as keyof typeof ROLE_LABEL] ?? l.role}${l.accountNumber ? '' : ' · no bank details'}`}
                    right={naira(l.net)}
                    rightSub={`from ${naira(l.gross)}`}
                    onClick={() => setSlip(l)}
                  />
                ))}
              </Rows>
            )}
          </Panel>
        </>
      )}

      {slip && p && (
        <Modal title={`${slip.name} · ${p.periodLabel}`} onClose={() => setSlip(null)}>
          <div className="space-y-4">
            <Facts
              items={[
                { label: 'Basic pay', value: naira(slip.basic) },
                { label: 'Allowances', value: naira(slip.allowances) },
                { label: 'Gross pay', value: <b>{naira(slip.gross)}</b> },
                { label: 'Pension (8%)', value: `− ${naira(slip.pension)}` },
                ...(slip.nhf ? [{ label: 'Housing fund (2.5%)', value: `− ${naira(slip.nhf)}` }] : []),
                { label: 'PAYE tax', value: slip.paye ? `− ${naira(slip.paye)}` : 'None' },
                { label: 'Take-home pay', value: <b className="text-lg">{naira(slip.net)}</b> },
                { label: 'Paid into', value: slip.accountNumber ? `${slip.bankName ?? ''} ${slip.accountNumber}` : 'No bank details' },
              ]}
            />
            <Btn variant="secondary" onClick={() => printSlips(p, [slip])}><Printer className="h-4 w-4" /> Print payslip</Btn>
          </div>
        </Modal>
      )}
    </Page>
  )
}

function bankList(p: Payroll) {
  downloadCsv(`payroll-${p.branchName}-${p.period}.csv`, [
    ['Name', 'Staff number', 'Bank', 'Account number', 'Amount (NGN)'],
    ...p.lines.map((l) => [l.name, l.staffNo, l.bankName ?? '', l.accountNumber ?? '', nairaPlain(l.net)]),
    ['Total', '', '', '', nairaPlain(p.totals.net)],
  ])
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function printSlips(p: Payroll, lines: PayrollLine[]) {
  const w = window.open('', '_blank')
  if (!w) return
  const slips = lines
    .map(
      (l) => `<div class="slip"><div class="head"><b>TARMAC SECURITY LTD</b><span>Payslip · ${esc(p.periodLabel)}</span></div>
      <p><b>${esc(l.name)}</b> · ${esc(l.staffNo)} · ${esc(p.branchName)} branch</p>
      <table>
        <tr><td>Basic pay</td><td class="r">${naira(l.basic)}</td></tr>
        <tr><td>Allowances</td><td class="r">${naira(l.allowances)}</td></tr>
        <tr class="b"><td>Gross pay</td><td class="r">${naira(l.gross)}</td></tr>
        <tr><td>Pension (8%)</td><td class="r">− ${naira(l.pension)}</td></tr>
        ${l.nhf ? `<tr><td>Housing fund (2.5%)</td><td class="r">− ${naira(l.nhf)}</td></tr>` : ''}
        <tr><td>PAYE tax</td><td class="r">− ${naira(l.paye)}</td></tr>
        <tr class="b big"><td>Take-home pay</td><td class="r">${naira(l.net)}</td></tr>
      </table>
      <p>Paid into: ${l.accountNumber ? `${esc(l.bankName ?? '')} ${esc(l.accountNumber)}` : 'no bank details'}</p></div>`,
    )
    .join('')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payslips ${esc(p.branchName)} ${esc(p.periodLabel)}</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:14px}.slip{border:1px solid #999;border-radius:8px;padding:16px;margin-bottom:20px;page-break-inside:avoid}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #1e3a8a;padding-bottom:8px;color:#1e3a8a}
    table{width:100%;border-collapse:collapse}td{padding:5px 0;border-bottom:1px solid #eee}.r{text-align:right}.b td{font-weight:bold}.big td{font-size:16px}
  </style></head><body>${slips}</body></html>`)
  w.document.close()
  w.focus()
  w.print()
}
