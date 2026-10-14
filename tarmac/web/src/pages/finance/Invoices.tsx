import { useState, type FormEvent } from 'react'
import { Plus, Printer, Trash2 } from 'lucide-react'
import { finance, type Client, type Invoice, type InvoiceDetail, type InvoiceLine } from '../../services/finance'
import { cx, dateLabel, monthOptions, naira, periodLabel, thisPeriod, toKobo, toNairaText } from './format'
import {
  Btn, Empty, Facts, Failed, Field, FormButtons, Loading, Modal, MoneyInput, Notice, Page, Panel, Row, Rows, SelectInput, Status, TextArea, TextInput,
} from './ui'
import { useData, useFlash, useSave } from './hooks'
import { downloadInvoicePdf } from './invoicePdf'

// eslint-disable-next-line react-refresh/only-export-components
export function invoiceStatus(i: Pick<Invoice, 'status' | 'overdue' | 'balanceKobo'>) {
  if (i.status === 'paid') return <Status tone="good">Paid</Status>
  if (i.status === 'cancelled') return <Status tone="plain">Cancelled</Status>
  if (i.status === 'draft') return <Status tone="plain">Not sent yet</Status>
  if (i.overdue) return <Status tone="bad">Late</Status>
  if (i.status === 'part_paid') return <Status tone="wait">Part paid</Status>
  return <Status tone="wait">Waiting for payment</Status>
}

type Filter = 'open' | 'paid' | 'all'

export default function FinanceInvoices() {
  const { data, error, loading, reload } = useData(async () => {
    const [invoices, clients, settings] = await Promise.all([finance.invoices(), finance.clients(), finance.settings()])
    return { invoices, clients, vatOn: settings.vatOnInvoices }
  })
  const [filter, setFilter] = useState<Filter>('open')
  const [form, setForm] = useState<null | 'new' | 'month'>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { flash, node } = useFlash()
  const done = (m: string) => {
    flash(m)
    void reload()
  }

  const rows = (data?.invoices ?? []).filter((i) =>
    filter === 'all' ? true : filter === 'paid' ? i.status === 'paid' : i.status === 'draft' || i.status === 'sent' || i.status === 'part_paid',
  )
  const tabs: { key: Filter; label: string }[] = [
    { key: 'open', label: 'Not paid yet' },
    { key: 'paid', label: 'Paid' },
    { key: 'all', label: 'All' },
  ]

  return (
    <Page
      title="Invoices"
      help="Bills to clients. Each invoice shows the account number the client pays into; when they pay, it is marked paid by itself. Download it as a PDF to send to them."
      action={
        data?.clients.length ? (
          <>
            <Btn variant="secondary" onClick={() => setForm('month')}>Make this month's bills for everyone</Btn>
            <Btn onClick={() => setForm('new')}>New invoice</Btn>
          </>
        ) : undefined
      }
    >
      {node}
      {data && <VatSwitch on={data.vatOn} onDone={done} />}
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && data.clients.length === 0 && <Notice tone="info">Add a client first (Clients page). Then you can bill them here.</Notice>}
      {data && data.clients.length > 0 && (
        <Panel>
          <div className="flex gap-2 border-b border-border p-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cx(
                  'h-11 rounded-lg px-4 text-base font-semibold',
                  filter === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <Empty title={filter === 'open' ? 'Every invoice is paid' : 'No invoices here'} />
          ) : (
            <Rows>
              {rows.map((i) => (
                <Row
                  key={i.id}
                  title={i.clientName}
                  sub={`${i.number} · ${i.periodLabel}`}
                  right={naira(i.totalKobo)}
                  rightSub={i.status === 'part_paid' ? `${naira(i.balanceKobo)} still to pay` : i.status === 'paid' ? undefined : `Due ${dateLabel(i.dueDate)}`}
                  status={invoiceStatus(i)}
                  onClick={() => setOpenId(i.id)}
                />
              ))}
            </Rows>
          )}
        </Panel>
      )}

      {form === 'new' && data && <NewInvoice vatOn={data.vatOn} clients={data.clients} onClose={() => setForm(null)} onDone={(m) => { setForm(null); done(m) }} />}
      {form === 'month' && <BillMonth onClose={() => setForm(null)} onDone={(m) => { setForm(null); done(m) }} />}
      {openId && <InvoiceDialog id={openId} onClose={() => setOpenId(null)} onDone={done} />}
    </Page>
  )
}

function BillMonth({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [period, setPeriod] = useState(thisPeriod())
  const save = useSave()
  return (
    <Modal title="Make this month's bills for everyone" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          let result = { created: 0, skipped: 0 }
          if (await save.run(async () => { result = await finance.billMonth(period) })) {
            onDone(
              result.created
                ? `${result.created} invoice${result.created === 1 ? '' : 's'} created for ${periodLabel(period)}.${result.skipped ? ` ${result.skipped} client${result.skipped === 1 ? ' was' : 's were'} already billed.` : ''}`
                : `Every client already has an invoice for ${periodLabel(period)}.`,
            )
          }
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <p className="text-base">Instead of making invoices one by one: this makes one invoice for every client, for their usual monthly fee. Anyone who already has an invoice for that month is skipped.</p>
        <Field label="Month"><SelectInput value={period} onChange={setPeriod} options={monthOptions()} /></Field>
        <FormButtons onCancel={onClose} saveLabel="Create invoices" busy={save.busy} />
      </form>
    </Modal>
  )
}

type LineText = { description: string; quantity: string; price: string }

function LinesEditor({ lines, onChange }: { lines: LineText[]; onChange: (l: LineText[]) => void }) {
  const set = (i: number, patch: Partial<LineText>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  return (
    <div className="space-y-3">
      {lines.map((l, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-4">
          <Field label="What is it for?">
            <TextInput value={l.description} onChange={(e) => set(i, { description: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-[100px_1fr_auto] items-end gap-3">
            <Field label="Quantity"><TextInput value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} inputMode="decimal" required /></Field>
            <Field label="Price each"><MoneyInput value={l.price} onChange={(v) => set(i, { price: v })} required /></Field>
            {lines.length > 1 && (
              <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="Remove line" className="mb-1 rounded-lg p-3 text-muted-foreground hover:bg-muted hover:text-destructive">
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      ))}
      <Btn variant="quiet" onClick={() => onChange([...lines, { description: '', quantity: '1', price: '' }])}>
        <Plus className="h-4 w-4" /> Add another line
      </Btn>
    </div>
  )
}

function toLines(lines: LineText[]): InvoiceLine[] | string {
  const out: InvoiceLine[] = []
  for (const l of lines) {
    const unit = toKobo(l.price)
    const qty = Number(l.quantity)
    if (unit === null) return 'Enter a price for every line'
    if (!Number.isFinite(qty) || qty <= 0) return 'Quantity must be more than zero'
    out.push({ description: l.description, quantity: qty, unitKobo: unit })
  }
  return out
}

/** What the total will be, before saving (with 7.5% VAT on top when it is switched on). */
function Preview({ lines, vatOn = true }: { lines: LineText[]; vatOn?: boolean }) {
  const parsed = toLines(lines)
  if (typeof parsed === 'string') return null
  const subtotal = parsed.reduce((s, l) => s + Math.round(l.quantity * l.unitKobo), 0)
  const vat = vatOn ? Math.round((subtotal * 750) / 10_000) : 0
  if (!vatOn) return <div className="rounded-xl bg-muted/60 px-4 py-1"><Facts items={[{ label: 'Total', value: <b>{naira(subtotal)}</b> }]} /></div>
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-1">
      <Facts items={[{ label: 'Before VAT', value: naira(subtotal) }, { label: 'VAT (7.5%)', value: naira(vat) }, { label: 'Total', value: <b>{naira(subtotal + vat)}</b> }]} />
    </div>
  )
}

function NewInvoice({ clients, vatOn, onClose, onDone }: { clients: Client[]; vatOn: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const active = clients.filter((c) => c.status === 'active')
  const [clientId, setClientId] = useState('')
  const [period, setPeriod] = useState(thisPeriod())
  const [lines, setLines] = useState<LineText[]>([])
  const [notes, setNotes] = useState('')
  const save = useSave()

  const pickClient = (id: string) => {
    setClientId(id)
    const c = active.find((x) => x.id === id)
    setLines(c ? [{ description: `Security services — ${periodLabel(period)}`, quantity: '1', price: toNairaText(c.monthlyFeeKobo) }] : [])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const parsed = toLines(lines)
    if (typeof parsed === 'string') return save.setError(parsed)
    let number = ''
    if (await save.run(async () => { number = (await finance.createInvoice({ clientId, period, lines: parsed, notes })).number })) {
      onDone(`Invoice ${number} created. Open it to print or mark it as sent.`)
    }
  }

  return (
    <Modal title="New invoice" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Client">
          <SelectInput value={clientId} onChange={pickClient} required placeholder="Choose a client" options={active.map((c) => ({ value: c.id, label: `${c.name} (${c.branchName})` }))} />
        </Field>
        <Field label="Month"><SelectInput value={period} onChange={setPeriod} options={monthOptions()} /></Field>
        {clientId && (
          <>
            <LinesEditor lines={lines} onChange={setLines} />
            <Preview lines={lines} vatOn={vatOn} />
            <Field label="Note on the invoice (optional)"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </>
        )}
        <FormButtons onCancel={onClose} saveLabel="Create invoice" busy={save.busy} />
      </form>
    </Modal>
  )
}

function EditInvoice({ invoice, onClose, onDone }: { invoice: InvoiceDetail; onClose: () => void; onDone: (m: string) => void }) {
  const [lines, setLines] = useState<LineText[]>(invoice.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), price: toNairaText(l.unitKobo) })))
  const [dueDate, setDueDate] = useState(invoice.dueDate)
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const save = useSave()
  return (
    <Modal title={`Edit ${invoice.number}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const parsed = toLines(lines)
          if (typeof parsed === 'string') return save.setError(parsed)
          if (await save.run(() => finance.updateInvoice({ invoiceId: invoice.id, lines: parsed, dueDate, notes }))) onDone('Invoice saved.')
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <LinesEditor lines={lines} onChange={setLines} />
        <Preview lines={lines} vatOn={invoice.vatKobo > 0} />
        <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required /></Field>
        <Field label="Note on the invoice (optional)"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <FormButtons onCancel={onClose} busy={save.busy} />
      </form>
    </Modal>
  )
}

function InvoiceDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (m: string) => void }) {
  const { data: inv, error, loading, reload } = useData(() => finance.invoice(id), [id])
  const [editing, setEditing] = useState(false)
  const action = useSave()
  const act = async (fn: () => Promise<unknown>, m: string) => {
    if (await action.run(fn)) {
      onDone(m)
      void reload()
    }
  }

  return (
    <Modal title={inv ? `Invoice ${inv.number}` : 'Invoice'} onClose={onClose} wide>
      {loading && !inv && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {inv && (
        <div className="space-y-5">
          {action.error && <Notice tone="bad">{action.error}</Notice>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-bold">{inv.clientName}</div>
              <div className="text-[15px] text-muted-foreground">{inv.periodLabel} · due {dateLabel(inv.dueDate)}</div>
            </div>
            {invoiceStatus(inv)}
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            {inv.lines.map((l, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3 last:border-0">
                <span>
                  {l.description}
                  {l.quantity !== 1 && <span className="text-muted-foreground"> · {l.quantity} × {naira(l.unitKobo)}</span>}
                </span>
                <span className="font-semibold tabular-nums">{naira(Math.round(l.quantity * l.unitKobo))}</span>
              </div>
            ))}
          </div>
          <Facts
            items={[
              { label: 'Before VAT', value: naira(inv.subtotalKobo) },
              ...(inv.vatKobo > 0 ? [{ label: 'VAT (7.5%)', value: naira(inv.vatKobo) }] : []),
              { label: 'Total', value: <b className="text-lg">{naira(inv.totalKobo)}</b> },
              { label: 'Paid so far', value: naira(inv.paidKobo) },
              { label: 'Still to pay', value: inv.balanceKobo > 0 ? <span className="text-destructive">{naira(inv.balanceKobo)}</span> : 'Nothing' },
            ]}
          />
          {inv.client?.payAccountNumber ? (
            <p className="text-base">
              Pay into <b>{inv.client.payBankName} {inv.client.payAccountNumber}</b> ({inv.client.payAccountName}).
            </p>
          ) : (
            <Notice tone="warn">This client has no payment account number yet. Add one on the Clients page before sending this invoice.</Notice>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Btn onClick={() => void downloadInvoicePdf(inv)}>Download PDF</Btn>
            <Btn variant="secondary" onClick={() => printInvoice(inv)}><Printer className="h-4 w-4" /> Print</Btn>
            {inv.status === 'draft' && <Btn busy={action.busy} onClick={() => act(() => finance.markSent(inv.id), `${inv.number} marked as sent.`)}>Mark as sent</Btn>}
            {inv.status !== 'paid' && inv.status !== 'cancelled' && <Btn variant="secondary" onClick={() => setEditing(true)}>Edit</Btn>}
            {inv.paidKobo === 0 && inv.status !== 'cancelled' && (
              <Btn variant="danger" onClick={() => window.confirm(`Cancel invoice ${inv.number}?`) && act(() => finance.cancelInvoice(inv.id), `${inv.number} cancelled.`)}>
                Cancel invoice
              </Btn>
            )}
          </div>
        </div>
      )}
      {editing && inv && <EditInvoice invoice={inv} onClose={() => setEditing(false)} onDone={(m) => { setEditing(false); onDone(m); void reload() }} />}
    </Modal>
  )
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Opens a clean printable copy of the invoice (save as PDF from the print box). */
function printInvoice(inv: InvoiceDetail) {
  const w = window.open('', '_blank')
  if (!w) return
  const c = inv.client
  const lines = inv.lines
    .map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.quantity}</td><td class="r">${naira(l.unitKobo)}</td><td class="r">${naira(Math.round(l.quantity * l.unitKobo))}</td></tr>`)
    .join('')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:40px;font-size:14px}h1{margin:0;font-size:28px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e3a8a;padding-bottom:16px}
    .brand{font-size:20px;font-weight:bold;color:#1e3a8a}table{width:100%;border-collapse:collapse;margin-top:20px}
    th{background:#1e3a8a;color:#fff;text-align:left;padding:8px}td{padding:8px;border-bottom:1px solid #ddd}.r{text-align:right}
    .tot{margin-left:auto;width:320px;margin-top:16px}.tot div{display:flex;justify-content:space-between;padding:4px 0}
    .grand{font-size:18px;font-weight:bold;border-top:2px solid #111;padding-top:8px!important}
    .pay{margin-top:28px;padding:16px;border:2px solid #1e3a8a;border-radius:8px}.big{font-size:22px;font-weight:bold;letter-spacing:1px}
  </style></head><body>
    <div class="top"><div><div class="brand">TARMAC SECURITY LTD</div><div>10 Domkat Bali Road, Jos, Plateau State</div></div>
    <div style="text-align:right"><h1>INVOICE</h1><div>${esc(inv.number)}</div><div>${esc(inv.periodLabel)}</div><div>Due ${esc(dateLabel(inv.dueDate))}</div></div></div>
    <p><b>Bill to:</b> ${esc(c?.name ?? inv.clientName)}${c?.address ? `<br>${esc(c.address)}` : ''}${c?.contactName ? `<br>Attn: ${esc(c.contactName)}` : ''}</p>
    <table><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>${lines}</table>
    <div class="tot">${inv.vatKobo > 0 ? `<div><span>Before VAT</span><span>${naira(inv.subtotalKobo)}</span></div><div><span>VAT (7.5%)</span><span>${naira(inv.vatKobo)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${naira(inv.totalKobo)}</span></div>${inv.paidKobo ? `<div><span>Paid</span><span>${naira(inv.paidKobo)}</span></div><div><b>Balance</b><b>${naira(inv.balanceKobo)}</b></div>` : ''}</div>
    ${c?.payAccountNumber ? `<div class="pay">Please pay into your Tarmac account:<div class="big">${esc(c.payAccountNumber)}</div>${esc(c.payBankName ?? '')} · ${esc(c.payAccountName ?? '')}</div>` : ''}
    ${inv.notes ? `<p style="margin-top:20px">${esc(inv.notes)}</p>` : ''}
    </body></html>`)
  w.document.close()
  // Printed from here rather than an inline script: the site's security
  // policy blocks inline scripts, and the blank window inherits it.
  w.focus()
  w.print()
}

/** VAT is a government tax some companies must add to their bills. Tarmac decides. */
function VatSwitch({ on, onDone }: { on: boolean; onDone: (m: string) => void }) {
  const save = useSave()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="max-w-2xl">
        <div className="font-semibold">Add 7.5% VAT to new invoices: {on ? 'Yes' : 'No'}</div>
        <div className="text-[15px] text-muted-foreground">
          VAT is a government tax. If Tarmac is registered for VAT, the law says it must be added to every bill and paid to FIRS. Ask Tarmac's accountant if unsure.
        </div>
        {save.error && <div className="text-[15px] text-destructive">{save.error}</div>}
      </div>
      <Btn variant="secondary" busy={save.busy} onClick={() => save.run(() => finance.setVat(!on)).then((ok) => ok && onDone(on ? 'New invoices will not add VAT.' : 'New invoices will add 7.5% VAT.'))}>
        {on ? 'Stop adding VAT' : 'Add VAT'}
      </Btn>
    </div>
  )
}
