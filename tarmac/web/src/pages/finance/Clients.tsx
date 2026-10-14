import { useState, type FormEvent } from 'react'
import { Copy } from 'lucide-react'
import { finance, type Branch, type Client } from '../../services/finance'
import { dateLabel, dateTimeLabel, naira, periodLabel, thisPeriod, toKobo, toNairaText } from './format'
import {
  Btn, Empty, Facts, Failed, Field, FormButtons, Loading, Modal, MoneyInput, Notice, Page, Panel, Row, Rows, SelectInput, Status, TextInput,
} from './ui'
import { useData, useFlash, useSave } from './hooks'
import { invoiceStatus } from './Invoices'

export default function FinanceClients() {
  const { data, error, loading, reload } = useData(async () => {
    const [clients, branches, status] = await Promise.all([finance.clients(), finance.branches(), finance.status()])
    return { clients, branches, monnify: status.monnifyConnected }
  })
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const { flash, node } = useFlash()
  const done = (m: string) => {
    flash(m)
    void reload()
  }

  const q = search.trim().toLowerCase()
  const shown = (data?.clients ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.branchName.toLowerCase().includes(q) || (c.payAccountNumber ?? '').includes(q))

  return (
    <Page
      title="Clients"
      help="Every client has their own account number. Whatever they pay into it is recorded and shared automatically."
      action={data?.branches.length ? <Btn onClick={() => setAdding(true)}>Add a client</Btn> : undefined}
    >
      {node}
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && data.branches.length === 0 && (
        <Notice tone="info">Add your branches first (Branches page), then come back to add clients.</Notice>
      )}
      {data && data.branches.length > 0 && (
        <Panel>
          {data.clients.length > 6 && (
            <div className="border-b border-border p-4">
              <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, branch or account number" />
            </div>
          )}
          {data.clients.length === 0 ? (
            <Empty title="No clients yet" text="Add your first client to start sending invoices." action={<Btn onClick={() => setAdding(true)}>Add a client</Btn>} />
          ) : shown.length === 0 ? (
            <Empty title="No client matches your search" />
          ) : (
            <Rows>
              {shown.map((c) => (
                <Row
                  key={c.id}
                  title={c.name}
                  sub={`${c.branchName} · ${c.payAccountNumber ? `${c.payBankName} ${c.payAccountNumber}` : 'No account number yet'}`}
                  right={naira(c.monthlyFeeKobo)}
                  rightSub="a month"
                  status={
                    c.status === 'ended' ? (
                      <Status tone="plain">Contract ended</Status>
                    ) : c.owedKobo > 0 ? (
                      <Status tone="bad">Owes {naira(c.owedKobo)}</Status>
                    ) : (
                      <Status tone="good">Paid up</Status>
                    )
                  }
                  onClick={() => setOpenId(c.id)}
                />
              ))}
            </Rows>
          )}
        </Panel>
      )}

      {adding && data && (
        <ClientForm branches={data.branches} onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); done(m) }} />
      )}
      {openId && data && (
        <ClientDialog id={openId} branches={data.branches} monnify={data.monnify} onClose={() => setOpenId(null)} onDone={done} />
      )}
    </Page>
  )
}

function ClientForm({ branches, client, onClose, onDone }: { branches: Branch[]; client?: Client; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({
    name: client?.name ?? '',
    branchId: client?.branchId ?? '',
    fee: client ? toNairaText(client.monthlyFeeKobo) : '',
    guards: client ? String(client.guards) : '',
    contactName: client?.contactName ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    address: client?.address ?? '',
    contractEnd: client?.contractEnd ?? '',
  })
  const save = useSave()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const fee = toKobo(f.fee)
    if (fee === null) return save.setError('Enter the monthly fee in naira')
    const body = {
      name: f.name,
      branchId: f.branchId,
      monthlyFeeKobo: fee,
      guards: Number(f.guards || 0),
      contactName: f.contactName,
      phone: f.phone,
      email: f.email,
      address: f.address,
      contractEnd: f.contractEnd,
    }
    const ok = await save.run(() => (client ? finance.updateClient({ clientId: client.id, ...body }) : finance.createClient(body)))
    if (ok) onDone(client ? 'Client details saved.' : `${f.name} added.`)
  }

  return (
    <Modal title={client ? `Edit ${client.name}` : 'Add a client'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Client name"><TextInput value={f.name} onChange={set('name')} required placeholder="e.g. Rayfield Estate" /></Field>
        <Field label="Branch">
          <SelectInput value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} required placeholder="Choose a branch" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </Field>
        <Field label="Monthly fee (before VAT)"><MoneyInput value={f.fee} onChange={(v) => setF({ ...f, fee: v })} required /></Field>
        <Field label="Number of guards"><TextInput value={f.guards} onChange={set('guards')} inputMode="numeric" /></Field>
        <Field label="Contact person"><TextInput value={f.contactName} onChange={set('contactName')} /></Field>
        <Field label="Phone"><TextInput value={f.phone} onChange={set('phone')} inputMode="tel" /></Field>
        <Field label="Email" hint="Needed to open their payment account with Monnify"><TextInput value={f.email} onChange={set('email')} type="email" /></Field>
        <Field label="Address"><TextInput value={f.address} onChange={set('address')} /></Field>
        <Field label="Contract ends (optional)"><TextInput value={f.contractEnd} onChange={set('contractEnd')} type="date" /></Field>
        <FormButtons onCancel={onClose} saveLabel={client ? 'Save' : 'Add client'} busy={save.busy} />
      </form>
    </Modal>
  )
}

function ClientDialog({ id, branches, monnify, onClose, onDone }: { id: string; branches: Branch[]; monnify: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const { data: c, error, loading, reload } = useData(() => finance.client(id), [id])
  const [form, setForm] = useState<null | 'edit' | 'account'>(null)
  const action = useSave()
  const refresh = (m: string) => {
    setForm(null)
    onDone(m)
    void reload()
  }
  const act = async (fn: () => Promise<unknown>, m: string) => {
    if (await action.run(fn)) refresh(m)
  }

  return (
    <Modal title={c?.name ?? 'Client'} onClose={onClose} wide>
      {loading && !c && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {c && (
        <div className="space-y-6">
          {action.error && <Notice tone="bad">{action.error}</Notice>}

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Payment account</h3>
            {c.payAccountNumber ? (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
                <div className="text-[15px] text-muted-foreground">Send this to {c.name}. They pay into:</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className="text-2xl font-bold tabular-nums tracking-wide">{c.payAccountNumber}</span>
                  <CopyButton text={`${c.payAccountNumber}\n${c.payBankName ?? ''}\n${c.payAccountName ?? ''}`} />
                </div>
                <div className="text-base">{c.payBankName} · {c.payAccountName}</div>
                <div className="mt-1 text-sm text-muted-foreground">The money lands in the Head Office account and is marked as {c.name}'s payment.</div>
              </div>
            ) : (
              <Notice tone="warn">
                <div className="font-semibold">No payment account number yet.</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {monnify && (
                    <Btn busy={action.busy} onClick={() => act(() => finance.createClientAccount(c.id), 'Account number created.')}>
                      Get an account number from Monnify
                    </Btn>
                  )}
                </div>
              </Notice>
            )}
          </section>

          <Facts
            items={[
              { label: 'Branch', value: c.branchName },
              { label: 'Monthly fee (before VAT)', value: naira(c.monthlyFeeKobo) },
              { label: 'Owes now', value: c.owedKobo > 0 ? <span className="text-destructive">{naira(c.owedKobo)}</span> : 'Nothing' },
              { label: 'Guards', value: c.guards },
              { label: 'Contact', value: [c.contactName, c.phone].filter(Boolean).join(' · ') || '—' },
              { label: 'Email', value: c.email ?? '—' },
              { label: 'Address', value: c.address ?? '—' },
              { label: 'Contract ends', value: c.contractEnd ? dateLabel(c.contractEnd) : '—' },
            ]}
          />

          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={() => setForm('edit')}>Edit details</Btn>
            {c.status === 'active' && (
              <Btn
                variant="secondary"
                busy={action.busy}
                onClick={() => act(() => finance.createInvoice({ clientId: c.id, period: thisPeriod() }), `Invoice for ${periodLabel(thisPeriod())} created.`)}
              >
                Bill for {periodLabel(thisPeriod())}
              </Btn>
            )}
            {c.status === 'active' ? (
              <Btn variant="danger" onClick={() => window.confirm(`End ${c.name}'s contract?`) && act(() => finance.setClientStatus(c.id, 'ended'), 'Contract ended.')}>End contract</Btn>
            ) : (
              <Btn variant="secondary" onClick={() => act(() => finance.setClientStatus(c.id, 'active'), 'Client is active again.')}>Make active again</Btn>
            )}
          </div>

          <section className="space-y-2">
            <h3 className="text-lg font-semibold">Invoices</h3>
            {c.invoices.length === 0 ? (
              <p className="text-base text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {c.invoices.map((i) => (
                  <div key={i.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1">
                      <div className="font-semibold">{i.number}</div>
                      <div className="text-[15px] text-muted-foreground">{periodLabel(i.period)}</div>
                    </div>
                    {invoiceStatus({ ...i, overdue: false, balanceKobo: i.totalKobo - i.paidKobo })}
                    <div className="w-32 text-right font-semibold tabular-nums">{naira(i.totalKobo)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-semibold">Payments</h3>
            {c.payments.length === 0 ? (
              <p className="text-base text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {c.payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1">
                      <div className="font-semibold">{dateTimeLabel(p.receivedAt)}</div>
                      <div className="text-[15px] text-muted-foreground">Ref {p.reference}</div>
                    </div>
                    {p.state === 'held' ? <Status tone="wait">On hold</Status> : <Status tone="good">Shared</Status>}
                    <div className="w-32 text-right font-semibold tabular-nums">{naira(p.amountKobo)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {form === 'edit' && c && <ClientForm branches={branches} client={c} onClose={() => setForm(null)} onDone={refresh} />}
      {form === 'account' && c && <AccountForm client={c} onClose={() => setForm(null)} onDone={refresh} />}
    </Modal>
  )
}

function AccountForm({ client, onClose, onDone }: { client: Client; onClose: () => void; onDone: (m: string) => void }) {
  const [bank, setBank] = useState('')
  const [account, setAccount] = useState('')
  const [name, setName] = useState(client.name)
  const save = useSave()
  return (
    <Modal title={`${client.name}'s account number`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await save.run(() => finance.setClientAccount({ clientId: client.id, bankName: bank, accountNumber: account, accountName: name }))) {
            onDone('Account number saved.')
          }
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Bank"><TextInput value={bank} onChange={(e) => setBank(e.target.value)} required placeholder="e.g. Moniepoint MFB" /></Field>
        <Field label="Account number" hint="10 digits"><TextInput value={account} onChange={(e) => setAccount(e.target.value)} required inputMode="numeric" /></Field>
        <Field label="Name on the account"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <FormButtons onCancel={onClose} busy={save.busy} />
      </form>
    </Modal>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch {
          window.prompt('Copy the account details:', text)
        }
      }}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
      aria-label="Copy account details"
    >
      <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
