import { useState, type FormEvent } from 'react'
import { finance, type Client, type Payment } from '../../services/finance'
import { useNavigate } from 'react-router-dom'
import { dateTimeLabel, dayToMs, monthOptions, naira, thisPeriod, toKobo, todayWat } from './format'
import {
  Btn, Empty, Facts, Failed, Field, FormButtons, Hero, HeroFigure, Loading, Modal, MoneyInput, Notice, Page, Panel, Row, Rows, SelectInput, SplitBar, Status, TextArea, TextInput,
} from './ui'
import { useData, useFlash, useSave } from './hooks'

export default function FinancePayments() {
  const [period, setPeriod] = useState(thisPeriod())
  const { data, error, loading, reload } = useData(async () => {
    const [payments, clients, status] = await Promise.all([finance.payments(period), finance.clients(), finance.status()])
    return { ...payments, clients, monnify: status.monnifyConnected }
  }, [period])
  const [recording, setRecording] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const { flash, node } = useFlash()
  const release = useSave()
  const done = (m: string) => {
    flash(m)
    void reload()
  }
  const all = [...(data?.payments ?? []), ...(data?.held ?? [])]
  const open = all.find((p) => p.id === openId) ?? null
  const s = data?.sharedSplit

  return (
    <Page
      title="Money in"
      help="Every payment from a client, and exactly where it went."
      action={
        <>
          <div className="w-52"><SelectInput value={period} onChange={setPeriod} options={monthOptions()} /></div>
          {data?.clients.length ? <Btn onClick={() => setRecording(true)}>Record a payment</Btn> : null}
        </>
      }
    >
      {node}
      {data && !data.monnify && (
        <Notice tone="info">
          Monnify is not connected yet, so payments are recorded by hand with <b>Record a payment</b>. Once it is connected, payments into clients'
          account numbers will appear here by themselves.
        </Notice>
      )}
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && (
        <>
          {data.held.length > 0 && (
            <Panel title="On hold">
              {release.error && <div className="p-4"><Notice tone="bad">{release.error}</Notice></div>}
              <Rows>
                {data.held.map((p) => (
                  <div key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <div className="text-base font-semibold">{p.clientName}</div>
                      <div className="text-[15px] text-muted-foreground">{p.branchName} branch · {dateTimeLabel(p.receivedAt)}</div>
                    </div>
                    <div className="text-lg font-bold tabular-nums">{naira(p.amountKobo)}</div>
                    <Btn busy={release.busy} onClick={async () => (await release.run(() => finance.releasePayment(p.id))) && done('Payment released and shared.')}>
                      Release and share
                    </Btn>
                  </div>
                ))}
              </Rows>
            </Panel>
          )}

          <Hero
            label={`Received in ${monthOptions().find((m) => m.value === period)?.label ?? period}`}
            value={naira(data.receivedKobo)}
            sub={`${data.payments.length} payment${data.payments.length === 1 ? '' : 's'}${data.held.length ? ` · ${data.held.length} on hold` : ''}`}
            side={<HeroFigure label="Shared out" value={s ? naira(s.hq + s.vat + s.partner + s.salary) : '₦0'} />}
          >
            {s && (
              <SplitBar
                parts={[
                  { key: 'hq', label: 'Head Office keeps', amount: naira(s.hq), weight: s.hq },
                  { key: 'vat', label: 'VAT', amount: naira(s.vat), weight: s.vat },
                  { key: 'partner', label: 'Partners', amount: naira(s.partner), weight: s.partner },
                  { key: 'salary', label: 'Branches', amount: naira(s.salary), weight: s.salary },
                ]}
              />
            )}
          </Hero>

          <Panel title="All payments this month">
            {data.payments.length === 0 ? (
              <Empty title="No payments this month" />
            ) : (
              <Rows>
                {data.payments.map((p) => (
                  <Row
                    key={p.id}
                    title={p.clientName}
                    sub={`${dateTimeLabel(p.receivedAt)}${p.method ? ` · ${p.method}` : ''}`}
                    right={naira(p.amountKobo)}
                    status={paymentStatus(p)}
                    onClick={() => setOpenId(p.id)}
                  />
                ))}
              </Rows>
            )}
          </Panel>
        </>
      )}

      {recording && data && <RecordPayment clients={data.clients} onClose={() => setRecording(false)} onDone={(m) => { setRecording(false); done(m) }} />}
      {open && <PaymentDialog payment={open} onClose={() => setOpenId(null)} onDone={(m) => { setOpenId(null); done(m) }} />}
    </Page>
  )
}

/** One word for where a payment stands, including whether its shares reached the banks. */
function paymentStatus(p: Payment) {
  if (p.state === 'held') return <Status tone="wait">On hold</Status>
  if (!p.payouts.length) return <Status tone="good">Shared</Status>
  const sent = p.payouts.filter((x) => x.status === 'sent').length
  if (sent === p.payouts.length) return <Status tone="good">All sent</Status>
  if (p.payouts.some((x) => x.status === 'failed' || x.status === 'needs_code')) return <Status tone="bad">Needs you</Status>
  return <Status tone="wait">{sent} of {p.payouts.length} sent</Status>
}

const PAYOUT_WORD = { waiting: 'Waiting for an account', ready: 'Ready to send', sending: 'Being sent', needs_code: 'Needs the email code', sent: 'Sent', failed: 'Did not go through' } as const

function RecordPayment({ clients, onClose, onDone }: { clients: Client[]; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ clientId: '', amount: '', day: todayWat(), method: 'Bank transfer', reference: '', note: '' })
  const save = useSave()
  const client = clients.find((c) => c.id === f.clientId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const amountKobo = toKobo(f.amount)
    if (!amountKobo) return save.setError('Enter the amount received')
    if (f.day > todayWat()) return save.setError('The date cannot be in the future')
    const ok = await save.run(() =>
      finance.recordPayment({ clientId: f.clientId, amountKobo, receivedAt: dayToMs(f.day), method: f.method, reference: f.reference, note: f.note }),
    )
    if (ok) onDone(`${naira(amountKobo)} from ${client?.name ?? 'the client'} recorded.`)
  }

  return (
    <Modal title="Record a payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Who paid?">
          <SelectInput value={f.clientId} onChange={(v) => setF({ ...f, clientId: v })} required placeholder="Choose a client" options={clients.map((c) => ({ value: c.id, label: `${c.name} (${c.branchName})` }))} />
        </Field>
        {client && client.owedKobo > 0 && <p className="text-[15px] text-muted-foreground">{client.name} owes {naira(client.owedKobo)} at the moment.</p>}
        <Field label="Amount received"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
        <Field label="Date received"><TextInput type="date" value={f.day} max={todayWat()} onChange={(e) => setF({ ...f, day: e.target.value })} required /></Field>
        <Field label="How was it paid?">
          <SelectInput value={f.method} onChange={(v) => setF({ ...f, method: v })} options={['Bank transfer', 'Cash', 'Cheque', 'POS'].map((m) => ({ value: m, label: m }))} />
        </Field>
        <Field label="Bank reference (optional)" hint="Stops the same payment being recorded twice"><TextInput value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Note (optional)"><TextArea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <p className="text-[15px] text-muted-foreground">It pays the client's oldest unpaid invoice first, then is shared by the branch's rule.</p>
        <FormButtons onCancel={onClose} saveLabel="Record payment" busy={save.busy} />
      </form>
    </Modal>
  )
}

function PaymentDialog({ payment: p, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: (m: string) => void }) {
  const undo = useSave()
  const navigate = useNavigate()
  return (
    <Modal title={`Payment from ${p.clientName}`} onClose={onClose}>
      <div className="space-y-5">
        {undo.error && <Notice tone="bad">{undo.error}</Notice>}
        <div className="text-3xl font-bold tabular-nums">{naira(p.amountKobo)}</div>
        <Facts
          items={[
            { label: 'Received', value: dateTimeLabel(p.receivedAt) },
            { label: 'Branch', value: p.branchName },
            { label: 'How', value: p.source === 'monnify' ? 'Into their account (Monnify)' : p.method ?? 'Recorded by hand' },
            { label: 'Reference', value: p.reference },
            { label: 'Status', value: paymentStatus(p) },
          ]}
        />
        <div>
          <h3 className="mb-1 text-lg font-semibold">{p.state === 'held' ? 'Will be shared as' : 'Shared as'}</h3>
          <Facts
            items={(['hq', 'vat', 'partner', 'salary'] as const).map((share) => {
              const out = p.payouts.find((x) => x.share === share)
              const label = { hq: 'Head Office', vat: 'VAT', partner: 'Partner', salary: 'Branch salaries' }[share]
              return {
                label,
                value: (
                  <span className="flex flex-col items-end gap-1">
                    <span className="tabular-nums">{naira(p.split[share])}</span>
                    {!out && p.source === 'monnify' && p.state === 'shared' && (
                      <span className="text-sm font-normal text-muted-foreground">Stays in Head Office's account</span>
                    )}
                    {out && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {PAYOUT_WORD[out.status]}{out.toName && out.status !== 'waiting' ? ` · ${out.toName}` : out.waitingFor ? ` · ${out.waitingFor}` : ''}
                      </span>
                    )}
                  </span>
                ),
              }
            })}
          />
          {p.payouts.length > 0 && p.payouts.some((x) => x.status !== 'sent') && (
            <Btn variant="quiet" onClick={() => navigate('/finance/money-out')}>Open Money out</Btn>
          )}
          {p.source === 'manual' && p.state === 'shared' && (
            <p className="mt-2 text-[15px] text-muted-foreground">This payment was recorded by hand, so Head Office shares it out itself. Only money that comes in through Monnify is sent automatically.</p>
          )}
        </div>
        {p.unallocatedKobo > 0 && <Notice tone="info">{naira(p.unallocatedKobo)} of this was more than the client owed at the time, so it is not matched to any invoice.</Notice>}
        {p.note && <p className="text-base">Note: {p.note}</p>}
        {p.source === 'manual' && (
          <div className="border-t border-border pt-4">
            <Btn
              variant="danger"
              busy={undo.busy}
              onClick={async () => window.confirm('Undo this payment? Use this only if it was recorded by mistake.') && (await undo.run(() => finance.undoPayment(p.id))) && onDone('Payment undone.')}
            >
              Undo this payment
            </Btn>
          </div>
        )}
      </div>
    </Modal>
  )
}
