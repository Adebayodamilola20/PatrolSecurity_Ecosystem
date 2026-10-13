import { useState, type FormEvent } from 'react'
import { finance, type Client, type Payment } from '../../services/finance'
import { dateTimeLabel, dayToMs, monthOptions, naira, thisPeriod, toKobo, todayWat } from './format'
import {
  Btn, Empty, Facts, Failed, Field, FormButtons, Loading, Modal, MoneyInput, Notice, Page, Panel, Row, Rows, SelectInput, Stats, Status, TextArea, TextInput,
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
      title="Payments"
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

          <Stats
            items={[
              { label: `Received in ${monthOptions().find((m) => m.value === period)?.label ?? period}`, value: naira(data.receivedKobo), note: `${data.payments.length} payment${data.payments.length === 1 ? '' : 's'}` },
              { label: 'Shared out', value: s ? naira(s.hq + s.vat + s.partner + s.salary) : '₦0', note: 'To Head Office, VAT, partners and salaries' },
            ]}
          />

          {s && s.hq + s.vat + s.partner + s.salary > 0 && (
            <Panel title="Where the money went">
              <div className="px-5 py-1">
                <Facts
                  items={[
                    { label: 'Head Office (8%)', value: naira(s.hq) },
                    { label: 'VAT set aside (7.5%)', value: naira(s.vat) },
                    { label: 'Branch partners (34.5%)', value: naira(s.partner) },
                    { label: 'Branch salaries (50%)', value: naira(s.salary) },
                  ]}
                />
              </div>
            </Panel>
          )}

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
                    status={p.state === 'held' ? <Status tone="wait">On hold</Status> : <Status tone="good">Shared</Status>}
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
            { label: 'Status', value: p.state === 'held' ? <Status tone="wait">On hold</Status> : <Status tone="good">Shared</Status> },
          ]}
        />
        <div>
          <h3 className="mb-1 text-lg font-semibold">{p.state === 'held' ? 'Will be shared as' : 'Shared as'}</h3>
          <Facts
            items={[
              { label: 'Head Office', value: naira(p.split.hq) },
              { label: 'VAT set aside', value: naira(p.split.vat) },
              { label: `Partner${p.partnerName ? ` (${p.partnerName})` : ''}`, value: naira(p.split.partner) },
              { label: 'Branch salaries', value: naira(p.split.salary) },
            ]}
          />
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
