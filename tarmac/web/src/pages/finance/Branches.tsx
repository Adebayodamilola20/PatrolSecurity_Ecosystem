import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { finance, type Branch, type Partner } from '../../services/finance'
import { dateLabel, naira, pct, todayWat } from './format'
import { BankAccountFields, emptyBankChoice } from './BankAccount'
import {
  Btn, Check, MoneyInput, Facts, Field, FormButtons, Modal, Notice, TextArea, TextInput,
} from './ui'
import { useSave } from './hooks'

/** Branches are managed on the Money out page now. Old links land there. */
export default function FinanceBranches() {
  return <Navigate to="/finance/money-out" replace />
}

export function AddBranch({ hasHq, onClose, onDone }: { hasHq: boolean; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState('')
  const [isHq, setIsHq] = useState(false)
  const save = useSave()
  const [split, setSplit] = useState(emptySplit)
  const [bank, setBank] = useState(emptyBankChoice())
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const bps = toBps(split)
    if (!bps) return save.setError('The amount cannot be more than ₦1,000,000')
    if (bps.salary > 0 && !bank.checked) return save.setError("Add the branch's bank account and wait for the name to appear")
    const account = bank.checked ? { bankCode: bank.checked.bankCode, accountNumber: bank.checked.accountNumber } : {}
    if (await save.run(() => finance.createBranch({ name, isHq, splitBps: bps, ...account }))) onDone(name.trim())
  }
  return (
    <Modal title="Add a branch" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Branch name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Kaduna" />
        </Field>
        {!hasHq && <Check checked={isHq} onChange={setIsHq} label="This branch is the Head Office" />}
        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-lg font-semibold">The branch's bank account</h3>
          <BankAccountFields value={bank} onChange={setBank} whose={`the ${name || 'branch'}'s account`} />
        </div>
        <div className="border-t border-border pt-4">
          <h3 className="text-lg font-semibold">How much the branch gets</h3>
          <SplitFields value={split} onChange={setSplit} />
        </div>
        <FormButtons onCancel={onClose} saveLabel="Add branch" busy={save.busy} />
      </form>
    </Modal>
  )
}

type Form = null | 'rename' | 'salary' | 'hold' | 'split' | 'partner' | 'editPartner'

export function BranchDialog({
  branch,
  partners,
  onClose,
  onDone,
}: {
  branch: Branch
  partners: Partner[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [form, setForm] = useState<Form>(null)
  const action = useSave()
  const active = partners.find((p) => p.status === 'active')
  const waiting = partners.find((p) => p.status === 'pending')
  const s = branch.splitBps

  const act = async (fn: () => Promise<unknown>, message: string) => {
    if (await action.run(fn)) onDone(message)
  }
  // A saved sub-form closes and leaves the branch open, showing the change.
  const saved = (message: string) => {
    setForm(null)
    onDone(message)
  }

  return (
    <Modal title={branch.isHq ? `${branch.name} (Head Office)` : `${branch.name} branch`} onClose={onClose} wide>
      <div className="space-y-6">
        {action.error && <Notice tone="bad">{action.error}</Notice>}

        {branch.onHold && (
          <Notice tone="warn">
            <div className="font-semibold">This branch is on hold.</div>
            <div className="text-[15px]">
              Payments are recorded but not shared{branch.holdReleaseOn ? ` until ${dateLabel(branch.holdReleaseOn)}, when they are released by themselves` : ' until it is taken off hold'}.
              {branch.holdNote ? ` Reason: ${branch.holdNote}` : ''}
            </div>
          </Notice>
        )}

        <Facts
          items={[
            { label: 'Clients', value: branch.clients },
            { label: 'Staff', value: branch.staff },
            { label: 'Received this month', value: naira(branch.collectedKobo) },
            { label: 'Owed by clients', value: naira(branch.owedKobo) },
            {
              label: 'Sharing',
              value: [
                `Salary account ${pct(s.salary)}`,
                s.partner ? `Partner ${pct(s.partner)}` : '',
                s.hq ? `Head Office ${pct(s.hq)}` : '',
                s.vat ? `VAT ${pct(s.vat)}` : '',
              ].filter(Boolean).join(' · '),
            },
            {
              label: 'Salary account',
              value: branch.salaryAccountNumber
                ? `${branch.salaryBankName ?? ''} · ${branch.salaryAccountNumber}${branch.salaryAccountName ? ` · ${branch.salaryAccountName}` : ''}`
                : <span className="text-muted-foreground">Not added yet</span>,
            },
          ]}
        />

        {s.partner > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Partner</h3>
          {waiting && (
            <Notice tone="warn">
              <div className="font-semibold">{waiting.name} is waiting for approval.</div>
              <div className="text-[15px]">
                {waiting.bankName} · {waiting.accountNumber} · {waiting.accountName}
              </div>
              <div className="text-[15px]">No money goes to this partner until it is approved, by another Head Office admin if there is one.</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn busy={action.busy} onClick={() => act(() => finance.approvePartner(waiting.id), `${waiting.name} approved as ${branch.name} partner.`)}>
                  Approve partner
                </Btn>
                <Btn variant="danger" onClick={() => act(() => finance.removePartner(waiting.id), `${waiting.name} removed.`)}>Reject</Btn>
              </div>
            </Notice>
          )}
          {active ? (
            <div className="rounded-xl border border-border px-4 py-1">
              <Facts
                items={[
                  { label: 'Name', value: active.name },
                  { label: 'Phone', value: active.phone },
                  { label: 'Bank account', value: `${active.bankName} · ${active.accountNumber} · ${active.accountName}` },
                  { label: 'Paid this month', value: naira(active.paidThisMonthKobo) },
                ]}
              />
            </div>
          ) : (
            !waiting && (
              <p className="text-base text-muted-foreground">
                {branch.isHq
                  ? 'Head Office has no partner, so its partner share goes to the Head Office account.'
                  : 'This branch has no partner. Its partner share waits at Head Office until one is added and approved.'}
              </p>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {!waiting && <Btn variant="secondary" onClick={() => setForm('partner')}>{active ? 'Replace partner' : 'Add a partner'}</Btn>}
            {active && <Btn variant="secondary" onClick={() => setForm('editPartner')}>Change partner details</Btn>}
            {active && (
              <Btn variant="danger" onClick={() => window.confirm(`Remove ${active.name} as partner?`) && act(() => finance.removePartner(active.id), `${active.name} removed.`)}>
                Remove partner
              </Btn>
            )}
          </div>
        </section>
        )}

        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-lg font-semibold">Branch settings</h3>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={() => setForm('salary')}>Salary account</Btn>
            <Btn variant="secondary" onClick={() => setForm('split')}>Change sharing</Btn>
            <Btn variant="secondary" onClick={() => setForm('rename')}>Rename</Btn>
            {branch.onHold ? (
              <Btn busy={action.busy} onClick={() => act(() => finance.setHold(branch.id, false), `${branch.name} is no longer on hold.`)}>Take off hold</Btn>
            ) : (
              <Btn variant="danger" onClick={() => setForm('hold')}>Put on hold</Btn>
            )}
            <Btn
              variant="danger"
              busy={action.busy}
              onClick={async () => {
                if (!window.confirm(`Remove the ${branch.name} branch? Only an empty branch (no clients, no staff, no money waiting) can be removed.`)) return
                if (await action.run(() => finance.removeBranch(branch.id))) {
                  onClose()
                  onDone(`${branch.name} branch removed.`)
                }
              }}
            >
              Remove branch
            </Btn>
          </div>
        </section>
      </div>

      {form === 'rename' && <RenameForm branch={branch} onClose={() => setForm(null)} onDone={saved} />}
      {form === 'salary' && <SalaryForm branch={branch} onClose={() => setForm(null)} onDone={saved} />}
      {form === 'hold' && <HoldForm branch={branch} onClose={() => setForm(null)} onDone={saved} />}
      {form === 'split' && <SplitForm branch={branch} onClose={() => setForm(null)} onDone={saved} />}
      {form === 'partner' && <PartnerForm branch={branch} onClose={() => setForm(null)} onDone={saved} />}
      {form === 'editPartner' && active && <PartnerForm branch={branch} partner={active} onClose={() => setForm(null)} onDone={saved} />}
    </Modal>
  )
}

export type SubForm = { branch: Branch; onClose: () => void; onDone: (m: string) => void }

function RenameForm({ branch, onClose, onDone }: SubForm) {
  const [name, setName] = useState(branch.name)
  const save = useSave()
  return (
    <Modal title="Rename branch" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await save.run(() => finance.updateBranch({ branchId: branch.id, name }))) onDone('Branch renamed.')
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Branch name"><TextInput value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <FormButtons onCancel={onClose} busy={save.busy} />
      </form>
    </Modal>
  )
}

export function SalaryForm({ branch, onClose, onDone }: SubForm) {
  const [bank, setBank] = useState(emptyBankChoice())
  const save = useSave()
  return (
    <Modal title={`${branch.name} salary account`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!bank.checked) return
          const ok = await save.run(() => finance.updateBranch({ branchId: branch.id, bankCode: bank.checked!.bankCode, accountNumber: bank.checked!.accountNumber }))
          if (ok) onDone('Salary account saved.')
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <p className="text-[15px] text-muted-foreground">
          The branch's salary share is sent here, and payroll is paid from it.
          {branch.salaryAccountNumber && ` Now: ${branch.salaryBankName ?? ''} ${branch.salaryAccountNumber}${branch.salaryAccountName ? ` (${branch.salaryAccountName})` : ' (not yet checked with the bank)'}.`}
        </p>
        <BankAccountFields value={bank} onChange={setBank} whose={`${branch.name}'s salary account`} />
        {bank.checked && <FormButtons onCancel={onClose} saveLabel="Yes, save this account" busy={save.busy} />}
      </form>
    </Modal>
  )
}

function HoldForm({ branch, onClose, onDone }: SubForm) {
  const [note, setNote] = useState('')
  const [releaseOn, setReleaseOn] = useState('')
  const save = useSave()
  return (
    <Modal title={`Put ${branch.name} on hold`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await save.run(() => finance.setHold(branch.id, true, note, releaseOn || undefined))) {
            onDone(releaseOn ? `${branch.name} is on hold until ${dateLabel(releaseOn)}.` : `${branch.name} is on hold.`)
          }
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <p className="text-base">Payments for {branch.name} will be recorded but not shared or sent while it is on hold.</p>
        <Field label="Release on this day (optional)" hint="On that morning the held money is shared and sent by itself. Leave empty to release it yourself.">
          <TextInput type="date" value={releaseOn} min={todayWat()} onChange={(e) => setReleaseOn(e.target.value)} />
        </Field>
        <Field label="Reason (optional)"><TextArea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <FormButtons onCancel={onClose} saveLabel="Put on hold" busy={save.busy} />
      </form>
    </Modal>
  )
}

function SplitForm({ branch, onClose, onDone }: SubForm) {
  const [v, setV] = useState(splitText(branch.splitBps))
  const save = useSave()
  return (
    <Modal title={`${branch.name} sharing`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const bps = toBps(v)
          if (!bps) return save.setError('The amount cannot be more than ₦1,000,000')
          if (await save.run(() => finance.setSplit(branch.id, bps))) onDone('Sharing changed.')
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <p className="text-[15px] text-muted-foreground">Applies to payments that come in from now on.</p>
        <SplitFields value={v} onChange={setV} />
        <FormButtons onCancel={onClose} busy={save.busy} />
      </form>
    </Modal>
  )
}

/** The admin types what the branch gets out of every ₦1,000,000; the percentage follows. */
type SplitText = { amount: string }
const BASE_NAIRA = 1_000_000
const emptySplit: SplitText = { amount: '' }
const splitText = (b: Branch['splitBps']): SplitText => ({ amount: b.salary ? String((BASE_NAIRA * b.salary) / 10_000) : '' })
/** Whatever the branch does not get stays in the Head Office account. */
function toBps(v: SplitText) {
  const naira = Number(v.amount.replace(/[^\d.]/g, '') || 0)
  if (!Number.isFinite(naira) || naira < 0 || naira > BASE_NAIRA) return null
  const salary = Math.round((naira / BASE_NAIRA) * 10_000)
  return { salary, partner: 0, hq: 10_000 - salary, vat: 0 }
}

function SplitFields({ value: v, onChange }: { value: SplitText; onChange: (v: SplitText) => void }) {
  const bps = toBps(v)
  const amount = Number(v.amount.replace(/[^\d.]/g, '') || 0)
  return (
    <div className="space-y-3">
      <Field label="Out of every ₦1,000,000 that comes in, the branch gets" hint="Type an amount in naira. The percentage is worked out for you.">
        <MoneyInput value={v.amount} onChange={(amount) => onChange({ amount })} placeholder="e.g. 500,000" />
      </Field>
      {bps ? (
        <div className="rounded-xl bg-muted px-4 py-3 text-[15px]">
          That is <b>{pct(bps.salary)}</b> of every payment. If ₦1,000,000 comes in, the branch gets <b>{naira(amount * 100)}</b> and Head Office keeps{' '}
          <b>{naira((BASE_NAIRA - amount) * 100)}</b>.
        </div>
      ) : (
        <p className="text-base font-semibold text-red-700 dark:text-red-300">That is more than ₦1,000,000.</p>
      )}
    </div>
  )
}

export function PartnerForm({ branch, partner, onClose, onDone }: SubForm & { partner?: Partner }) {
  const [p, setP] = useState({ name: partner?.name ?? '', phone: partner?.phone ?? '', email: partner?.email ?? '' })
  const [bank, setBank] = useState(emptyBankChoice(partner))
  const save = useSave()
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <Modal title={partner ? `Change ${partner.name}'s details` : `New partner for ${branch.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!bank.checked) return
          const account = { bankCode: bank.checked.bankCode, accountNumber: bank.checked.accountNumber }
          const ok = await save.run(() =>
            partner ? finance.updatePartner({ partnerId: partner.id, ...p, ...account }) : finance.createPartner({ branchId: branch.id, ...p, ...account }),
          )
          if (ok) onDone(partner ? 'Partner details saved.' : `${p.name} added. Approve them before money is sent.`)
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Full name"><TextInput value={p.name} onChange={set('name')} required /></Field>
        <Field label="Phone number"><TextInput value={p.phone} onChange={set('phone')} required inputMode="tel" /></Field>
        <Field label="Email (optional)"><TextInput value={p.email} onChange={set('email')} type="email" /></Field>
        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-lg font-semibold">Bank account</h3>
          <BankAccountFields value={bank} onChange={setBank} whose={p.name || `the ${branch.name} partner`} />
        </div>
        {partner && <Notice tone="warn">If you change the bank account, the partner must be approved again before any money is sent.</Notice>}
        {bank.checked ? (
          <FormButtons onCancel={onClose} saveLabel={partner ? 'Save' : 'Add partner'} busy={save.busy} />
        ) : (
          <p className="text-[15px] text-muted-foreground">Type the full account number — the account name will appear.</p>
        )}
      </form>
    </Modal>
  )
}
