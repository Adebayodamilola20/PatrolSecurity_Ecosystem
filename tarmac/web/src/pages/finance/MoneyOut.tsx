import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { finance, type Branch, type MoneySettings, type Partner, type Payout } from '../../services/finance'
import { naira, pct } from './format'
import { Btn, Empty, Failed, Field, FormButtons, Loading, Modal, Notice, Page, Panel, Stats, Status, TextInput } from './ui'
import { useData, useFlash, useSave } from './hooks'

import { AddBranch, BranchDialog, PartnerForm, SalaryForm } from './Branches'

/**
 * Money leaving Head Office's Monnify account: what was sent, what is waiting
 * and why, and the few things a person must do.
 */
export default function MoneyOut() {
  const { data, error, loading, reload } = useData(async () => {
    const [payouts, settings, branches, partners, balance] = await Promise.all([
      finance.payouts(),
      finance.settings(),
      finance.branches(),
      finance.partners(),
      finance.balance().catch(() => null),
    ])
    return { payouts, settings, branches, partners, balance }
  })
  const { flash, node } = useFlash()
  const send = useSave()
  const [editing, setEditing] = useState<null | 'wallet'>(null)
  const [branchForm, setBranchForm] = useState<null | { kind: 'partner' | 'salary'; branch: Branch }>(null)
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const done = (message: string) => {
    flash(message)
    setEditing(null)
    setBranchForm(null)
    setAdding(false)
    void reload()
  }

  const p = data?.payouts
  const s = data?.settings
  const needs = p?.open.filter((x) => x.status === 'failed' || x.status === 'needs_code') ?? []
  const waiting = p?.open.filter((x) => x.status === 'waiting') ?? []
  const moving = p?.open.filter((x) => x.status === 'ready' || x.status === 'sending') ?? []

  const sendNow = async () => {
    let result: Awaited<ReturnType<typeof finance.sendNow>> | undefined
    const ok = await send.run(async () => {
      result = await finance.sendNow()
    })
    if (!ok || !result) return
    if (result.reason) send.setError(result.reason)
    else done(`${result.sent} sent${result.failed ? `, ${result.failed} did not go through` : ''}${result.waiting ? `, ${result.waiting} still on the way` : ''}.`)
  }

  return (
    <Page
      title="Money out"
      help="Every payment lands in the Head Office account. Each branch's share is sent from there to the branch's own accounts, by the percentages set for that branch."
      action={
        p && p.counts.ready > 0 ? (
          <Btn busy={send.busy} onClick={sendNow} disabled={!s?.walletAccountNumber}>
            Send {naira(p.readyKobo)} now
          </Btn>
        ) : undefined
      }
    >
      {node}
      {send.error && <Notice tone="bad" onClose={() => send.setError(null)}>{send.error}</Notice>}
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {p && s && (
        <>
          <Stats
            items={[
              { label: 'Sent this month', value: naira(p.sentThisMonthKobo) },
              { label: 'Waiting for an account', value: naira(p.waitingKobo), tone: p.waitingKobo ? 'warn' : undefined, note: p.waitingKobo ? 'Safe at Head Office' : 'Nothing waiting' },
              { label: 'Needs you', value: String(needs.length), tone: needs.length ? 'bad' : undefined, note: needs.length ? 'See below' : 'Nothing to do' },
            ]}
          />

          <AutoSend settings={s} onDone={done} />

          {needs.length > 0 && (
            <Panel title="Needs you">
              <div className="divide-y divide-border">
                {needs.map((x) => <NeedsYou key={x.id} payout={x} onDone={done} />)}
              </div>
            </Panel>
          )}

          {waiting.length > 0 && (
            <Panel title="Waiting for a bank account">
              <p className="px-6 pt-4 text-[15px] text-muted-foreground">This money is safe at Head Office. It is sent by itself once the account is added.</p>
              <div className="divide-y divide-border">
                {waiting.map((x) => (
                  <PayoutLine
                    key={x.id}
                    payout={x}
                    title={`${x.branchName} — ${x.shareLabel}`}
                    sub={`${x.clientName} paid · waiting for ${x.waitingFor ?? 'an account'}`}
                    right={
                      (
                        (() => {
                          const branch = data.branches.find((b) => b.name === x.branchName)
                          return branch ? (
                            <Btn variant="quiet" onClick={() => setBranchForm({ kind: x.share === 'salary' ? 'salary' : 'partner', branch })}>Add the account</Btn>
                          ) : (
                            <Link to="/finance/money-out" className="inline-flex h-12 items-center px-3 font-medium text-primary hover:underline">Add the account</Link>
                          )
                        })()
                      )
                    }
                  />
                ))}
              </div>
            </Panel>
          )}

          {moving.length > 0 && (
            <Panel title="On the way">
              <div className="divide-y divide-border">
                {moving.map((x) => (
                  <PayoutLine
                    key={x.id}
                    payout={x}
                    title={x.toName ?? x.shareLabel}
                    sub={`${x.bankName ?? ''} · ${x.accountNumber ?? ''} · ${x.accountName ?? ''}`}
                    right={x.status === 'sending' ? <Status tone="wait">Being sent</Status> : <Status tone="plain">Ready to send</Status>}
                  />
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Head Office account">
            <div className="divide-y divide-border">
              <SetupLine
                label="Monnify account number"
                value={
                  s.walletAccountNumber
                    ? data.balance?.available
                      ? `${s.walletAccountNumber} · balance ${naira(data.balance.availableKobo)}`
                      : `${s.walletAccountNumber} — not recognised by Monnify. Change it to the number shown in Monnify → Disbursements.`
                    : null
                }
                empty="Not added yet. Find its 10-digit number in the Monnify dashboard under Disbursements."
                onEdit={() => setEditing('wallet')}
              />
            </div>
          </Panel>

          <Panel title="Branches" action={<Btn onClick={() => setAdding(true)}>Add a branch</Btn>}>
            <p className="px-6 pt-4 text-[15px] text-muted-foreground">
              Each branch gets its percentage of every payment, sent to its bank account. Click Manage to change one.
            </p>
            {data.branches.length === 0 ? (
              <Empty title="No branches yet" text="Add each branch with its bank account and how much it gets." action={<Btn onClick={() => setAdding(true)}>Add a branch</Btn>} />
            ) : (
              <div className="divide-y divide-border">
                {data.branches.map((b) => (
                  <BranchAccounts
                    key={b.id}
                    branch={b}
                    partners={data.partners.filter((x) => x.branchId === b.id)}
                    onEdit={(kind) => setBranchForm({ kind, branch: b })}
                    onManage={() => setOpenId(b.id)}
                    onDone={done}
                  />
                ))}
              </div>
            )}
          </Panel>

        </>
      )}

      {adding && data && <AddBranch hasHq={data.branches.some((b) => b.isHq)} onClose={() => setAdding(false)} onDone={(name) => done(`${name} added.`)} />}
      {openId && data?.branches.find((b) => b.id === openId) && (
        <BranchDialog
          branch={data.branches.find((b) => b.id === openId)!}
          partners={data.partners.filter((x) => x.branchId === openId)}
          onClose={() => setOpenId(null)}
          onDone={(m) => {
            if (/removed\.$/.test(m)) setOpenId(null)
            done(m)
          }}
        />
      )}
      {branchForm?.kind === 'salary' && <SalaryForm branch={branchForm.branch} onClose={() => setBranchForm(null)} onDone={done} />}
      {branchForm?.kind === 'partner' && (
        <PartnerForm
          branch={branchForm.branch}
          partner={data?.partners.find((x) => x.branchId === branchForm.branch.id && x.status === 'active')}
          onClose={() => setBranchForm(null)}
          onDone={done}
        />
      )}
      {editing === 'wallet' && s && <WalletForm current={s.walletAccountNumber} onClose={() => setEditing(null)} onDone={done} />}
    </Page>
  )
}

function PayoutLine({ payout, title, sub, right }: { payout: Payout; title: string; sub: string; right: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 text-[15px] text-muted-foreground">{sub}</div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-lg font-semibold tabular-nums">{naira(payout.amountKobo)}</span>
        {right}
      </div>
    </div>
  )
}

function NeedsYou({ payout, onDone }: { payout: Payout; onDone: (m: string) => void }) {
  const [code, setCode] = useState('')
  const save = useSave()
  const title = payout.toName ?? `${payout.branchName} — ${payout.shareLabel}`
  const bank = `${payout.bankName ?? ''} · ${payout.accountNumber ?? ''}`
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await save.run(() => finance.enterCode(payout.id, code))) onDone(`Code accepted for ${naira(payout.amountKobo)} to ${title}.`)
  }
  return (
    <div className="space-y-3 px-6 py-4">
      <PayoutLine
        payout={payout}
        title={title}
        sub={payout.status === 'failed' ? `${bank} · ${payout.error ?? 'Did not go through'}` : `${bank} · Monnify emailed a code to approve this`}
        right={
          payout.status === 'failed' ? (
            <>
              <Status tone="bad">Did not go through</Status>
              <Btn variant="secondary" busy={save.busy} onClick={() => save.run(() => finance.retryPayout(payout.id)).then((ok) => ok && onDone('It will be tried again.'))}>
                Try again
              </Btn>
            </>
          ) : (
            <form onSubmit={submit} className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-[15px] text-muted-foreground">
                Code
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  required
                  placeholder="6 digits"
                  className="h-12 w-32 rounded-xl border border-input bg-background px-3 text-lg tracking-widest text-foreground"
                />
              </label>
              <Btn type="submit" busy={save.busy}>Approve</Btn>
            </form>
          )
        }
      />
      {save.error && <Notice tone="bad">{save.error}</Notice>}
    </div>
  )
}

function SetupLine({ label, value, empty, onEdit }: { label: string; value: string | null; empty: string; onEdit: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div className="min-w-0">
        <div className="font-semibold">{label}</div>
        <div className={value ? 'mt-0.5 text-[15px]' : 'mt-0.5 text-[15px] text-muted-foreground'}>{value ?? empty}</div>
      </div>
      <Btn variant="secondary" onClick={onEdit}>{value ? 'Change' : 'Add'}</Btn>
    </div>
  )
}

function AutoSend({ settings, onDone }: { settings: MoneySettings; onDone: (m: string) => void }) {
  const save = useSave()
  const on = settings.autoSend
  const toggle = () => {
    if (!on && !window.confirm('Turn on automatic payments to the branches?')) return
    void save.run(() => finance.setAutoSend(!on)).then((ok) => ok && onDone(on ? 'Automatic sending is off.' : 'Automatic sending is on.'))
  }
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#111318] px-6 py-5 text-[#F2F3F6] sm:px-7">
      <div className="max-w-2xl">
        <div className="text-[17px] font-semibold">Pay the branches automatically: {on ? 'On' : 'Off'}</div>
        <div className="mt-1 text-[15px] text-[#A9AFBF]">
          {on
            ? settings.sendDay
              ? `Branches are paid by themselves on day ${settings.sendDay} of every month.`
              : 'Branches are paid by themselves as soon as money arrives.'
            : "Money waits here until someone presses Send. Turn this on once Tarmac's live Monnify account can make transfers."}
        </div>
        <label className="mt-3 flex flex-wrap items-center gap-3 text-[15px]">
          When:
          <select
            value={settings.sendDay ?? ''}
            onChange={(e) => {
              const day = e.target.value ? Number(e.target.value) : null
              void save.run(() => finance.setSendDay(day)).then((ok) => ok && onDone(day ? `Branches will be paid on day ${day} of every month.` : 'Branches will be paid as soon as money arrives.'))
            }}
            className="h-11 rounded-lg border border-white/20 bg-[#1C1F27] px-3 text-[#F2F3F6]"
          >
            <option value="">As soon as money arrives</option>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>Once a month, on day {d}</option>
            ))}
          </select>
        </label>
        {save.error && <div className="mt-2 text-[15px] text-[#F5A3A3]">{save.error}</div>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={save.busy}
        className="inline-flex h-12 items-center rounded-xl bg-white px-5 font-medium text-[#111318] hover:bg-white/90 disabled:opacity-60"
      >
        {on ? 'Turn off' : 'Turn on'}
      </button>
    </section>
  )
}

function WalletForm({ current, onClose, onDone }: { current: string | null; onClose: () => void; onDone: (m: string) => void }) {
  const [number, setNumber] = useState(current ?? '')
  const save = useSave()
  return (
    <Modal title="Head Office account (Monnify)" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await save.run(() => finance.setWallet(number))) onDone('Head Office account saved.')
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <p className="text-[15px] text-muted-foreground">This is Head Office's account on Monnify: every payment lands here and branch shares are sent from here. In the Monnify dashboard, open Disbursements to find its 10-digit number.</p>
        <Field label="Wallet account number"><TextInput value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={10} required /></Field>
        <FormButtons onCancel={onClose} busy={save.busy} />
      </form>
    </Modal>
  )
}

function BranchAccounts({
  branch: b,
  partners,
  onEdit,
  onManage,
  onDone,
}: {
  branch: Branch
  partners: Partner[]
  onEdit: (kind: 'partner' | 'salary') => void
  onManage: () => void
  onDone: (m: string) => void
}) {
  const approve = useSave()
  const active = partners.find((p) => p.status === 'active')
  const waiting = partners.find((p) => p.status === 'pending')
  const hasPartner = b.splitBps.partner > 0
  const ok = (!hasPartner || b.isHq || !!active) && (b.splitBps.salary === 0 || !!b.salaryAccountNumber)
  return (
    <div className="space-y-3 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{b.isHq ? `${b.name} (Head Office)` : b.name}</div>
          <div className="text-[15px] text-muted-foreground">
            Gets {pct(b.splitBps.salary)}{hasPartner ? ` · partner ${pct(b.splitBps.partner)}` : ''} · Head Office keeps {pct(b.splitBps.hq + b.splitBps.vat)}
            {b.onHold ? ' · on hold' : ''}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ok ? <Status tone="good">Ready to receive</Status> : <Status tone="wait">Bank account missing</Status>}
          <Btn variant="secondary" onClick={onManage}>Manage</Btn>
        </div>
      </div>
      <div className={hasPartner ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
        {hasPartner && (
        <div className="rounded-xl border border-border px-4 py-3">
          <div className="text-sm text-muted-foreground">Partner's {pct(b.splitBps.partner)} goes to</div>
          {waiting ? (
            <>
              <div className="mt-0.5 font-medium">{waiting.name} — waiting for approval</div>
              <div className="text-[15px] text-muted-foreground">{waiting.bankName} · {waiting.accountNumber} · {waiting.accountName}</div>
              <div className="mt-2">
                <Btn busy={approve.busy} onClick={() => approve.run(() => finance.approvePartner(waiting.id)).then((x) => x && onDone(`${waiting.name} approved.`))}>
                  Approve
                </Btn>
              </div>
              {approve.error && <p className="mt-1 text-[15px] text-destructive">{approve.error}</p>}
            </>
          ) : active ? (
            <>
              <div className="mt-0.5 font-medium">{active.name}</div>
              <div className="text-[15px] text-muted-foreground">{active.bankName} · {active.accountNumber} · {active.accountName}</div>
              <Btn variant="quiet" onClick={() => onEdit('partner')}>Change</Btn>
            </>
          ) : (
            <>
              <div className="mt-0.5 text-[15px] text-muted-foreground">{b.isHq ? 'Stays in the Head Office account (no partner)' : 'No partner yet'}</div>
              <Btn variant="quiet" onClick={() => onEdit('partner')}>Add a partner</Btn>
            </>
          )}
        </div>
        )}
        <div className="rounded-xl border border-border px-4 py-3">
          <div className="text-sm text-muted-foreground">Branch's {pct(b.splitBps.salary)} goes to</div>
          {b.salaryAccountNumber ? (
            <>
              <div className="mt-0.5 font-medium">{b.salaryAccountName ?? 'Salary account'}</div>
              <div className="text-[15px] text-muted-foreground">{b.salaryBankName} · {b.salaryAccountNumber}</div>
              <Btn variant="quiet" onClick={() => onEdit('salary')}>Change</Btn>
            </>
          ) : (
            <>
              <div className="mt-0.5 text-[15px] text-muted-foreground">No bank account yet</div>
              <Btn variant="quiet" onClick={() => onEdit('salary')}>Add the bank account</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
