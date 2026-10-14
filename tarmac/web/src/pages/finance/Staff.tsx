import { useRef, useState, type FormEvent } from 'react'
import { finance, type Branch, type Staff, type StaffRole, type StaffStatus } from '../../services/finance'
import { dateLabel, naira, toKobo, toNairaText } from './format'
import {
  Avatar, Btn, Check, Empty, Facts, Failed, Field, FormButtons, Loading, Modal, MoneyInput, Notice, Page, Panel, Row, Rows, SelectInput, Status, TextInput,
} from './ui'
import { useData, useFlash, useSave } from './hooks'
import { BankAccountFields, emptyBankChoice } from './BankAccount'

// eslint-disable-next-line react-refresh/only-export-components
export const ROLE_LABEL: Record<StaffRole, string> = { guard: 'Guard', supervisor: 'Supervisor', office: 'Office staff' }
const STATUS_LABEL: Record<StaffStatus, string> = { active: 'Working', leave: 'On leave', suspended: 'Suspended', left: 'Left Tarmac' }

function statusOf(s: Staff) {
  if (s.status === 'leave') return <Status tone="wait">On leave</Status>
  if (s.status === 'suspended') return <Status tone="bad">Suspended</Status>
  if (s.status === 'left') return <Status tone="plain">Left</Status>
  if (!s.accountNumber) return <Status tone="wait">No bank details</Status>
  if (!s.guarantorVerified) return <Status tone="wait">Guarantor not checked</Status>
  return <Status tone="good">Working</Status>
}

export default function FinanceStaff() {
  const { data, error, loading, reload } = useData(async () => {
    const [staff, branches] = await Promise.all([finance.staff(), finance.branches()])
    return { staff, branches }
  })
  const [branchId, setBranchId] = useState('')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const { flash, node } = useFlash()
  const done = (m: string) => {
    flash(m)
    void reload()
  }

  const q = search.trim().toLowerCase()
  const shown = (data?.staff ?? []).filter(
    (s) => (!branchId || s.branchId === branchId) && (!q || s.name.toLowerCase().includes(q) || s.staffNo.toLowerCase().includes(q)),
  )
  const open = data?.staff.find((s) => s.id === openId) ?? null

  return (
    <Page
      title="Staff"
      help="A record of everyone who works at each branch: their branch, pay and bank details. Payroll uses this list."
      action={data?.branches.length ? <Btn onClick={() => setAdding(true)}>Add staff</Btn> : undefined}
    >
      {node}
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && data.branches.length === 0 && <Notice tone="info">Add your branches first (Branches page).</Notice>}
      {data && data.branches.length > 0 && (
        <Panel>
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2">
            <SelectInput value={branchId} onChange={setBranchId} placeholder="All branches" options={data.branches.map((b) => ({ value: b.id, label: b.name }))} />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or staff number" />
          </div>
          {data.staff.length === 0 ? (
            <Empty title="No staff yet" text="Add staff one by one, or hire them from the Applicants page." action={<Btn onClick={() => setAdding(true)}>Add staff</Btn>} />
          ) : shown.length === 0 ? (
            <Empty title="Nobody matches" />
          ) : (
            <Rows>
              {shown.map((s) => (
                <Row
                  key={s.id}
                  lead={<Avatar name={s.name} url={s.photoUrl} />}
                  title={s.name}
                  sub={`${s.staffNo} · ${ROLE_LABEL[s.role]} · ${s.branchName}${s.post ? ` · ${s.post}` : ''}`}
                  right={naira(s.basicKobo + s.allowancesKobo)}
                  rightSub="a month"
                  status={statusOf(s)}
                  onClick={() => setOpenId(s.id)}
                />
              ))}
            </Rows>
          )}
        </Panel>
      )}

      {adding && data && <StaffForm branches={data.branches} onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); done(m) }} />}
      {open && data && <StaffDialog staff={open} branches={data.branches} onClose={() => setOpenId(null)} onDone={done} />}
    </Page>
  )
}

function StaffForm({ branches, staff, onClose, onDone }: { branches: Branch[]; staff?: Staff; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({
    name: staff?.name ?? '',
    phone: staff?.phone ?? '',
    branchId: staff?.branchId ?? '',
    role: (staff?.role ?? 'guard') as StaffRole,
    post: staff?.post ?? '',
    startDate: staff?.startDate ?? '',
    basic: staff ? toNairaText(staff.basicKobo) : '',
    allowances: staff ? toNairaText(staff.allowancesKobo) : '0',
    nhf: staff?.nhf ?? false,
    pensionPin: staff?.pensionPin ?? '',
    guarantorName: staff?.guarantorName ?? '',
    guarantorPhone: staff?.guarantorPhone ?? '',
    guarantorVerified: staff?.guarantorVerified ?? false,
  })
  const [bank, setBank] = useState(emptyBankChoice(staff))
  const save = useSave()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const basicKobo = toKobo(f.basic)
    const allowancesKobo = toKobo(f.allowances || '0')
    if (basicKobo === null || allowancesKobo === null) return save.setError('Enter the pay in naira')
    const number = bank.accountNumber.replace(/\D/g, '')
    const unchanged = !!staff && number === (staff.accountNumber ?? '') && bank.bankCode === ''
    // A new account must be checked with the bank first (when the bank list is available).
    if (number && !bank.checked && !unchanged && !bank.bankName) return save.setError('Wait for the account name to appear under the number before saving')
    const account = bank.checked
      ? { bankCode: bank.checked.bankCode, bankName: bank.checked.bankName, accountNumber: bank.checked.accountNumber }
      : unchanged
        ? { bankName: staff?.bankName ?? '', accountNumber: number }
        : { bankName: bank.bankName ?? '', accountNumber: number }
    const body = {
      name: f.name, phone: f.phone, branchId: f.branchId, role: f.role, post: f.post, startDate: f.startDate,
      basicKobo, allowancesKobo, nhf: f.nhf, ...account, pensionPin: f.pensionPin,
      guarantorName: f.guarantorName, guarantorPhone: f.guarantorPhone, guarantorVerified: f.guarantorVerified,
    }
    const ok = await save.run(() => (staff ? finance.updateStaff({ staffId: staff.id, ...body }) : finance.createStaff(body)))
    if (ok) onDone(staff ? 'Saved.' : `${f.name} added.`)
  }

  return (
    <Modal title={staff ? `Edit ${staff.name}` : 'Add staff'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Full name"><TextInput value={f.name} onChange={set('name')} required /></Field>
        <Field label="Phone"><TextInput value={f.phone} onChange={set('phone')} inputMode="tel" /></Field>
        <Field label="Branch">
          <SelectInput value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} required placeholder="Choose a branch" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </Field>
        <Field label="Job">
          <SelectInput value={f.role} onChange={(v) => setF({ ...f, role: v as StaffRole })} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Where they work (optional)"><TextInput value={f.post} onChange={set('post')} placeholder="e.g. Rayfield Estate" /></Field>
        <Field label="Start date (optional)"><TextInput type="date" value={f.startDate} onChange={set('startDate')} /></Field>

        <h3 className="pt-2 text-lg font-semibold">Pay</h3>
        <Field label="Basic pay a month"><MoneyInput value={f.basic} onChange={(v) => setF({ ...f, basic: v })} required /></Field>
        <Field label="Allowances a month"><MoneyInput value={f.allowances} onChange={(v) => setF({ ...f, allowances: v })} /></Field>

        <h3 className="pt-2 text-lg font-semibold">Bank</h3>
        {staff?.accountNumber && !bank.checked && bank.bankCode === '' && (
          <p className="text-[15px] text-muted-foreground">
            Now: {staff.bankName} · {staff.accountNumber}{staff.accountName ? ` · ${staff.accountName}` : ''}. To change it, choose the bank and type the new number.
          </p>
        )}
        <BankAccountFields value={bank} onChange={setBank} whose={f.name || 'this person'} allowTyped />

        <details className="rounded-xl border border-border px-4 py-3" open={!!(f.guarantorName || f.pensionPin || f.nhf)}>
          <summary className="cursor-pointer py-1 text-base font-semibold">More details (optional)</summary>
          <div className="space-y-4 pt-3">
            <Field label="Guarantor's name" hint="The person who vouches for this staff member."><TextInput value={f.guarantorName} onChange={set('guarantorName')} /></Field>
            <Field label="Guarantor's phone"><TextInput value={f.guarantorPhone} onChange={set('guarantorPhone')} inputMode="tel" /></Field>
            <Check checked={f.guarantorVerified} onChange={(v) => setF({ ...f, guarantorVerified: v })} label="Guarantor has been checked" />
            <Field label="Pension PIN" hint="The number from their pension company (it starts with PEN). Leave empty if you don't have it."><TextInput value={f.pensionPin} onChange={set('pensionPin')} /></Field>
            <Check checked={f.nhf} onChange={(v) => setF({ ...f, nhf: v })} label="Pays into the National Housing Fund (2.5% of basic pay)" />
          </div>
        </details>

        <FormButtons onCancel={onClose} saveLabel={staff ? 'Save' : 'Add staff'} busy={save.busy} />
      </form>
    </Modal>
  )
}

function StaffDialog({ staff: s, branches, onClose, onDone }: { staff: Staff; branches: Branch[]; onClose: () => void; onDone: (m: string) => void }) {
  const [editing, setEditing] = useState(false)
  const action = useSave()
  const setStatus = async (status: StaffStatus) => {
    if (await action.run(() => finance.setStaffStatus(s.id, status))) onDone(`${s.name}: ${STATUS_LABEL[status]}.`)
  }
  return (
    <Modal title={s.name} onClose={onClose}>
      <div className="space-y-5">
        {action.error && <Notice tone="bad">{action.error}</Notice>}
        <PhotoPicker staff={s} onDone={onDone} />
        <Facts
          items={[
            { label: 'Staff number', value: s.staffNo },
            { label: 'Job', value: ROLE_LABEL[s.role] },
            { label: 'Branch', value: s.branchName },
            { label: 'Works at', value: s.post ?? '—' },
            { label: 'Status', value: STATUS_LABEL[s.status] },
            { label: 'Started', value: s.startDate ? dateLabel(s.startDate) : '—' },
            { label: 'Basic pay', value: naira(s.basicKobo) },
            { label: 'Allowances', value: naira(s.allowancesKobo) },
            {
              label: 'Bank',
              value: s.accountNumber
                ? `${s.bankName ?? ''} · ${s.accountNumber}${s.accountName ? ` · ${s.accountName}` : ''}${s.bankChecked ? '' : ' (not checked with the bank)'}`
                : <span className="text-amber-800 dark:text-amber-300">Not added</span>,
            },
            { label: 'Guarantor', value: s.guarantorName ? `${s.guarantorName}${s.guarantorVerified ? ' (checked)' : ' (not checked)'}` : '—' },
            { label: 'Phone', value: s.phone ?? '—' },
          ]}
        />
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Btn onClick={() => setEditing(true)}>Edit</Btn>
          {s.status !== 'active' && <Btn variant="secondary" busy={action.busy} onClick={() => setStatus('active')}>Back at work</Btn>}
          {s.status === 'active' && <Btn variant="secondary" busy={action.busy} onClick={() => setStatus('leave')}>On leave</Btn>}
          {s.status !== 'suspended' && s.status !== 'left' && <Btn variant="danger" busy={action.busy} onClick={() => setStatus('suspended')}>Suspend</Btn>}
          {s.status !== 'left' && (
            <Btn variant="danger" busy={action.busy} onClick={() => window.confirm(`Mark ${s.name} as having left Tarmac?`) && setStatus('left')}>Has left</Btn>
          )}
        </div>
      </div>
      {editing && <StaffForm branches={branches} staff={s} onClose={() => setEditing(false)} onDone={(m) => { setEditing(false); onDone(m) }} />}
    </Modal>
  )
}

function PhotoPicker({ staff, onDone }: { staff: Staff; onDone: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const save = useSave()
  return (
    <div className="flex items-center gap-5">
      <Avatar name={staff.name} url={staff.photoUrl} size={96} />
      <div className="space-y-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (file.size > 5 * 1024 * 1024) return save.setError('Choose a photo smaller than 5 MB')
            if (await save.run(() => finance.uploadStaffPhoto(staff.id, file))) onDone(`Photo saved for ${staff.name}.`)
          }}
        />
        <Btn variant="secondary" busy={save.busy} onClick={() => input.current?.click()}>
          {staff.photoUrl ? 'Change photo' : 'Add a photo'}
        </Btn>
        {save.error && <p className="text-[15px] text-destructive">{save.error}</p>}
      </div>
    </div>
  )
}
