import { useState, type FormEvent } from 'react'
import { finance, type Branch, type Partner } from '../../services/finance'
import { dateLabel, naira, pct, todayWat } from './format'
import { BankAccountFields, emptyBankChoice } from './BankAccount'
import {
  Btn, Check, Empty, Facts, Failed, Field, FormButtons, Loading, Modal, Notice, Page, Panel, Row, Rows, Status, TextArea, TextInput,
} from './ui'
import { useData, useFlash, useSave } from './hooks'

export default function FinanceBranches() {
  const { data, error, loading, reload } = useData(async () => {
    const [branches, partners] = await Promise.all([finance.branches(), finance.partners()])
    return { branches, partners }
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const { flash, node } = useFlash()

  const open = data?.branches.find((b) => b.id === openId) ?? null
  const done = (message: string) => {
    flash(message)
    void reload()
  }

  return (
    <Page
      title="Branches"
      help="Each branch, its bank account and how much it gets. Click a branch to change it."
      action={data?.branches.length ? <Btn onClick={() => setAdding(true)}>Add a branch</Btn> : undefined}
    >
      {node}
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && data.branches.length === 0 && (
        <Panel>
          <Empty
            title="No branches yet"
            text="Add each branch your company runs. You can add as many as you need, now or later."
            action={<Btn onClick={() => setAdding(true)}>Add a branch</Btn>}
          />
        </Panel>
      )}
      {data && data.branches.length > 0 && (
        <Panel>
          <Rows>
            {data.branches.map((b) => (
              <Row
                key={b.id}
                title={b.isHq ? `${b.name} (Head Office)` : b.name}
                sub={
                  b.partnerWaiting
                    ? `New partner ${b.partnerWaiting.name} is waiting for approval`
                    : !b.salaryAccountNumber
                      ? 'No bank account yet'
                      : b.splitBps.partner > 0 && !b.partner && !b.isHq
                        ? 'No partner yet'
                        : `Gets ${pct(b.splitBps.salary)} · ${b.salaryBankName ?? ''} ${b.salaryAccountNumber}`
                }
                right={naira(b.collectedKobo)}
                rightSub={`this month · ${b.clients} client${b.clients === 1 ? '' : 's'}`}
                status={b.onHold ? <Status tone="wait">{b.holdReleaseOn ? `On hold until ${dateLabel(b.holdReleaseOn)}` : 'On hold'}</Status> : b.partnerWaiting ? <Status tone="wait">Needs approval</Status> : undefined}
                onClick={() => setOpenId(b.id)}
              />
            ))}
          </Rows>
        </Panel>
      )}

      {adding && data && <AddBranch hasHq={data.branches.some((b) => b.isHq)} onClose={() => setAdding(false)} onDone={(name) => { setAdding(false); done(`${name} branch added.`) }} />}
      {open && data && (
        <BranchDialog
          branch={open}
          partners={data.partners.filter((p) => p.branchId === open.id)}
          onClose={() => setOpenId(null)}
          onDone={done}
        />
      )}
    </Page>
  )
}

function AddBranch({ hasHq, onClose, onDone }: { hasHq: boolean; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState('')
  const [isHq, setIsHq] = useState(false)
  const save = useSave()
  const [split, setSplit] = useState(emptySplit)
  const [bank, setBank] = useState(emptyBankChoice())
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const bps = toBps(split)
    if (!bps) return save.setError("The branch's percentages cannot be more than 100%")
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

function BranchDialog({
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
          if (!bps) return save.setError('That is more than 100%')
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

type SplitText = { salary: string; partner: string; hasPartner: boolean }
const emptySplit: SplitText = { salary: '', partner: '', hasPartner: false }
const splitText = (b: Branch['splitBps']): SplitText => ({
  salary: b.salary ? String(b.salary / 100) : '',
  partner: b.partner ? String(b.partner / 100) : '',
  hasPartner: b.partner > 0,
})
const toNum = (x: string) => (x.trim() === '' ? 0 : Math.round(Number(x) * 100))
/**
 * The admin says what the branch gets (and its partner, if any); whatever is
 * left of each payment stays in the Head Office account.
 */
function toBps(v: SplitText) {
  const salary = toNum(v.salary)
  const partner = v.hasPartner ? toNum(v.partner) : 0
  if (![salary, partner].every((n) => Number.isFinite(n) && n >= 0)) return null
  const hq = 10_000 - salary - partner
  return hq < 0 ? null : { salary, partner, hq, vat: 0 }
}

function SplitFields({ value: v, onChange }: { value: SplitText; onChange: (v: SplitText) => void }) {
  const num = (x: string) => x.replace(/[^\d.]/g, '')
  const bps = toBps(v)
  const example = 1_000_000
  const share = (b: number) => naira(Math.round((example * b) / 10_000) * 100)
  return (
    <div className="space-y-4">
      <Field label="The branch gets (%)" hint="Of every payment, sent to the branch's bank account.">
        <TextInput value={v.salary} inputMode="decimal" placeholder="e.g. 50" onChange={(e) => onChange({ ...v, salary: num(e.target.value) })} />
      </Field>
      <Check checked={v.hasPartner} onChange={(hasPartner) => onChange({ ...v, hasPartner })} label="This branch also has a partner who gets a share" />
      {v.hasPartner && (
        <Field label="The partner gets (%)" hint="Sent to the partner's own bank account, added after the branch is saved.">
          <TextInput value={v.partner} inputMode="decimal" placeholder="e.g. 34.5" onChange={(e) => onChange({ ...v, partner: num(e.target.value) })} />
        </Field>
      )}
      {bps ? (
        <div className="rounded-xl bg-muted px-4 py-3 text-[15px]">
          <div className="font-semibold">Example: if ₦1,000,000 comes in for this branch</div>
          <div className="mt-1">The branch gets <b>{share(bps.salary)}</b></div>
          {v.hasPartner && <div>The partner gets <b>{share(bps.partner)}</b></div>}
          <div>Head Office keeps <b>{share(bps.hq)}</b> (what is left)</div>
        </div>
      ) : (
        <p className="text-base font-semibold text-red-700 dark:text-red-300">That is more than 100%.</p>
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
