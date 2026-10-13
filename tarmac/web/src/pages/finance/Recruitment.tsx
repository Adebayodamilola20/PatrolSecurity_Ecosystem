import { useState, type FormEvent } from 'react'
import { Check as CheckIcon } from 'lucide-react'
import { finance, type Applicant, type ApplicantStage, type Branch, type StaffRole } from '../../services/finance'
import { cx, dateLabel, toKobo, todayWat } from './format'
import {
  Btn, Empty, Failed, Field, FormButtons, Loading, Modal, MoneyInput, Notice, Page, Panel, Row, Rows, SelectInput, Status, TextArea, TextInput,
} from './ui'
import { useData, useFlash, useSave } from './hooks'
import { ROLE_LABEL } from './Staff'

const STEPS: { key: ApplicantStage; label: string }[] = [
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'interview', label: 'Interview' },
  { key: 'training', label: 'Training' },
  { key: 'hired', label: 'Hired' },
]
const stepLabel = (s: ApplicantStage) => (s === 'rejected' ? 'Not suitable' : STEPS.find((x) => x.key === s)!.label)

export default function FinanceRecruitment() {
  const { data, error, loading, reload } = useData(async () => {
    const [applicants, branches] = await Promise.all([finance.applicants(), finance.branches()])
    return { applicants, branches }
  })
  const [showAll, setShowAll] = useState(false)
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const { flash, node } = useFlash()
  const done = (m: string) => {
    flash(m)
    void reload()
  }
  const shown = (data?.applicants ?? []).filter((a) => showAll || (a.stage !== 'hired' && a.stage !== 'rejected'))
  const open = data?.applicants.find((a) => a.id === openId) ?? null

  return (
    <Page
      title="Applicants"
      help="New people from first contact to hired. Nobody can be hired until their guarantor has been checked."
      action={data?.branches.length ? <Btn onClick={() => setAdding(true)}>Add an applicant</Btn> : undefined}
    >
      {node}
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && data.branches.length === 0 && <Notice tone="info">Add your branches first (Branches page).</Notice>}
      {data && data.branches.length > 0 && (
        <Panel>
          <div className="border-b border-border p-3">
            <Btn variant="quiet" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show only people in progress' : 'Also show hired and not suitable'}</Btn>
          </div>
          {shown.length === 0 ? (
            <Empty title="No applicants in progress" action={<Btn onClick={() => setAdding(true)}>Add an applicant</Btn>} />
          ) : (
            <Rows>
              {shown.map((a) => (
                <Row
                  key={a.id}
                  title={a.name}
                  sub={`${a.branchName} · applied ${dateLabel(a.appliedOn)}`}
                  right={stepLabel(a.stage)}
                  status={a.guarantorVerified ? <Status tone="good">Guarantor checked</Status> : <Status tone="wait">Guarantor not checked</Status>}
                  onClick={() => setOpenId(a.id)}
                />
              ))}
            </Rows>
          )}
        </Panel>
      )}
      {adding && data && <AddApplicant branches={data.branches} onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); done(m) }} />}
      {open && <ApplicantDialog applicant={open} onClose={() => setOpenId(null)} onDone={done} />}
    </Page>
  )
}

function AddApplicant({ branches, onClose, onDone }: { branches: Branch[]; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ name: '', phone: '', branchId: '', guarantorName: '', guarantorPhone: '', notes: '' })
  const save = useSave()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await save.run(() => finance.createApplicant(f))) onDone(`${f.name} added.`)
  }
  return (
    <Modal title="Add an applicant" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Full name"><TextInput value={f.name} onChange={set('name')} required /></Field>
        <Field label="Phone"><TextInput value={f.phone} onChange={set('phone')} inputMode="tel" /></Field>
        <Field label="Branch">
          <SelectInput value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} required placeholder="Choose a branch" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </Field>
        <Field label="Guarantor's name (optional)"><TextInput value={f.guarantorName} onChange={set('guarantorName')} /></Field>
        <Field label="Guarantor's phone (optional)"><TextInput value={f.guarantorPhone} onChange={set('guarantorPhone')} inputMode="tel" /></Field>
        <Field label="Notes (optional)"><TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <FormButtons onCancel={onClose} saveLabel="Add applicant" busy={save.busy} />
      </form>
    </Modal>
  )
}

function ApplicantDialog({ applicant: a, onClose, onDone }: { applicant: Applicant; onClose: () => void; onDone: (m: string) => void }) {
  const [form, setForm] = useState<null | 'guarantor' | 'hire'>(null)
  const action = useSave()
  const index = STEPS.findIndex((s) => s.key === a.stage)
  const next = a.stage !== 'rejected' && index >= 0 && index < 3 ? STEPS[index + 1] : null
  const finished = a.stage === 'hired' || a.stage === 'rejected'
  const act = async (fn: () => Promise<unknown>, m: string) => {
    if (await action.run(fn)) onDone(m)
  }

  return (
    <Modal title={a.name} onClose={onClose}>
      <div className="space-y-5">
        {action.error && <Notice tone="bad">{action.error}</Notice>}
        <ol className="flex flex-wrap items-center gap-2 text-base">
          {STEPS.map((s, i) => {
            const reached = a.stage !== 'rejected' && i <= index
            return (
              <li key={s.key} className="flex items-center gap-2">
                <span className={cx('flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold', reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  {i < index && a.stage !== 'rejected' ? <CheckIcon className="h-4 w-4" /> : i + 1}
                </span>
                <span className={i === index ? 'font-semibold' : 'text-muted-foreground'}>{s.label}</span>
              </li>
            )
          })}
        </ol>
        {a.stage === 'rejected' && <Notice tone="warn">Marked as not suitable.</Notice>}

        <div className="rounded-xl border border-border px-4 py-3">
          <div className="text-[15px] text-muted-foreground">Guarantor</div>
          <div className="text-base font-semibold">
            {a.guarantorName ? `${a.guarantorName}${a.guarantorPhone ? ` · ${a.guarantorPhone}` : ''}` : 'Not added yet'}
          </div>
          <div className="mt-1">{a.guarantorVerified ? <Status tone="good">Checked</Status> : <Status tone="wait">Not checked yet</Status>}</div>
          {!finished && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn variant="secondary" onClick={() => setForm('guarantor')}>{a.guarantorName ? 'Change guarantor' : 'Add guarantor'}</Btn>
              {a.guarantorName && !a.guarantorVerified && (
                <Btn busy={action.busy} onClick={() => act(() => finance.updateApplicant({ applicantId: a.id, guarantorVerified: true }), 'Guarantor marked as checked.')}>
                  Guarantor has been checked
                </Btn>
              )}
            </div>
          )}
        </div>
        {a.notes && <p className="text-base">Notes: {a.notes}</p>}

        {!finished && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {next && (
              <Btn busy={action.busy} onClick={() => act(() => finance.updateApplicant({ applicantId: a.id, stage: next.key }), `${a.name} moved to ${next.label}.`)}>
                Move to {next.label}
              </Btn>
            )}
            <Btn variant={next ? 'secondary' : 'primary'} onClick={() => setForm('hire')} disabled={!a.guarantorVerified}>Hire</Btn>
            <Btn variant="danger" busy={action.busy} onClick={() => window.confirm(`Mark ${a.name} as not suitable?`) && act(() => finance.updateApplicant({ applicantId: a.id, stage: 'rejected' }), `${a.name} marked as not suitable.`)}>
              Not suitable
            </Btn>
          </div>
        )}
        {!finished && !a.guarantorVerified && <p className="text-[15px] text-muted-foreground">The Hire button works once the guarantor has been checked.</p>}
      </div>
      {form === 'guarantor' && <GuarantorForm applicant={a} onClose={() => setForm(null)} onDone={(m) => { setForm(null); onDone(m) }} />}
      {form === 'hire' && <HireForm applicant={a} onClose={() => setForm(null)} onDone={(m) => { setForm(null); onClose(); onDone(m) }} />}
    </Modal>
  )
}

function GuarantorForm({ applicant, onClose, onDone }: { applicant: Applicant; onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState(applicant.guarantorName ?? '')
  const [phone, setPhone] = useState(applicant.guarantorPhone ?? '')
  const save = useSave()
  return (
    <Modal title="Guarantor" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await save.run(() => finance.updateApplicant({ applicantId: applicant.id, guarantorName: name, guarantorPhone: phone }))) onDone('Guarantor saved.')
        }}
      >
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Guarantor's name"><TextInput value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Guarantor's phone"><TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
        <FormButtons onCancel={onClose} busy={save.busy} />
      </form>
    </Modal>
  )
}

function HireForm({ applicant, onClose, onDone }: { applicant: Applicant; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ role: 'guard' as StaffRole, post: '', basic: '', allowances: '0', startDate: todayWat() })
  const save = useSave()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const basicKobo = toKobo(f.basic)
    const allowancesKobo = toKobo(f.allowances || '0')
    if (basicKobo === null || allowancesKobo === null) return save.setError('Enter the pay in naira')
    let staffNo = ''
    const ok = await save.run(async () => {
      staffNo = (await finance.hireApplicant({ applicantId: applicant.id, role: f.role, post: f.post, basicKobo, allowancesKobo, startDate: f.startDate })).staffNo
    })
    if (ok) onDone(`${applicant.name} hired as staff number ${staffNo}. Add their bank details on the Staff page.`)
  }
  return (
    <Modal title={`Hire ${applicant.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Notice tone="bad">{save.error}</Notice>}
        <Field label="Job">
          <SelectInput value={f.role} onChange={(v) => setF({ ...f, role: v as StaffRole })} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Where they will work (optional)"><TextInput value={f.post} onChange={(e) => setF({ ...f, post: e.target.value })} /></Field>
        <Field label="Basic pay a month"><MoneyInput value={f.basic} onChange={(v) => setF({ ...f, basic: v })} required /></Field>
        <Field label="Allowances a month"><MoneyInput value={f.allowances} onChange={(v) => setF({ ...f, allowances: v })} /></Field>
        <Field label="Start date"><TextInput type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <FormButtons onCancel={onClose} saveLabel="Hire" busy={save.busy} />
      </form>
    </Modal>
  )
}
