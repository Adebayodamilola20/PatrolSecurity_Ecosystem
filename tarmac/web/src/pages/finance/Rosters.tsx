import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { finance, type RosterWeek, type Shift } from '../../services/finance'
import { cx, dateLabel, todayWat } from './format'
import {
  Btn, Empty, Failed, Loading, Notice, Page, Panel, SelectInput,
} from './ui'
import { useData } from './hooks'

const NEXT: Record<string, Shift | null> = { none: 'day', day: 'night', night: 'off', off: null }
const LOOK: Record<Shift, { label: string; className: string }> = {
  day: { label: 'Day', className: 'bg-primary/15 text-primary' },
  night: { label: 'Night', className: 'bg-primary text-primary-foreground' },
  off: { label: 'Off', className: 'bg-muted text-muted-foreground' },
}
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function shiftDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function FinanceRosters() {
  const branches = useData(() => finance.branches())
  const [picked, setPicked] = useState('')
  const branchId = picked || branches.data?.[0]?.id || ''
  const setBranchId = setPicked
  const [day, setDay] = useState(todayWat())
  const roster = useData(async () => (branchId ? finance.roster(branchId, day) : null), [branchId, day])
  const week: RosterWeek | null = roster.data
  // Clicks show at once; each is saved straight away and undone if it fails.
  const [edits, setEdits] = useState<Record<string, Shift | null>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const queue = useRef<Record<string, Promise<unknown>>>({})
  const error = saveError ?? roster.error
  const setError = setSaveError
  const loading = roster.loading
  const shiftOf = (staffId: string, date: string, server: Shift | null) => {
    const key = `${staffId}|${date}`
    return key in edits ? edits[key] : server
  }

  const change = async (pi: number, di: number) => {
    if (!week) return
    const person = week.people[pi]
    const date = week.days[di]
    const key = `${person.staffId}|${date}`
    const current = shiftOf(person.staffId, date, person.shifts[di])
    const next = NEXT[current ?? 'none']
    setEdits((e) => ({ ...e, [key]: next }))
    // Saves for one box go one after another, so a quick double-click can
    // never land out of order and leave the wrong shift saved.
    const previous = queue.current[key] ?? Promise.resolve()
    const mine = previous.then(() => finance.setShift(person.staffId, date, next)).catch((e) => {
      setEdits((x) => ({ ...x, [key]: current }))
      setSaveError(e instanceof Error ? e.message : 'That change was not saved')
    })
    queue.current[key] = mine
    await mine
  }

  const branchName = branches.data?.find((b) => b.id === branchId)?.name ?? ''

  return (
    <Page
      title="Rosters"
      help="Who works which day, day or night. Click a box to change it: Day, then Night, then Off, then empty."
      action={
        branches.data?.length ? (
          <>
            <div className="w-56">
              <SelectInput value={branchId} onChange={setBranchId} options={branches.data.map((b) => ({ value: b.id, label: `${b.name} branch` }))} />
            </div>
            <Btn variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Btn>
          </>
        ) : undefined
      }
    >
      {branches.loading && !branches.data && <Loading />}
      {branches.error && <Failed message={branches.error} onRetry={branches.reload} />}
      {branches.data && branches.data.length === 0 && <Notice tone="info">Add your branches first (Branches page).</Notice>}
      {error && <Notice tone="bad" onClose={() => setError(null)}>{error}</Notice>}
      {branchId && (
        <Panel
          title={week ? `${branchName}: week of ${dateLabel(week.days[0])}` : branchName}
          action={
            <div className="flex gap-2">
              <button type="button" aria-label="Previous week" onClick={() => setDay(shiftDays(day, -7))} className="rounded-lg border border-border p-2.5 hover:bg-muted"><ChevronLeft className="h-5 w-5" /></button>
              <Btn variant="secondary" onClick={() => setDay(todayWat())}>This week</Btn>
              <button type="button" aria-label="Next week" onClick={() => setDay(shiftDays(day, 7))} className="rounded-lg border border-border p-2.5 hover:bg-muted"><ChevronRight className="h-5 w-5" /></button>
            </div>
          }
        >
          {loading && !week && <Loading />}
          {week && week.people.length === 0 && <Empty title={`No staff in ${branchName} yet`} text="Add staff on the Staff page, then plan their week here." />}
          {week && week.people.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-base">
                <thead>
                  <tr className="border-b border-border text-left text-[15px] text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Name</th>
                    {week.days.map((d, i) => (
                      <th key={d} className={cx('px-1 py-3 text-center font-medium', d === todayWat() && 'text-primary')}>
                        {DAY_NAMES[i]} {Number(d.slice(8))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {week.people.map((p, pi) => (
                    <tr key={p.staffId}>
                      <td className="px-5 py-2.5">
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-sm text-muted-foreground">{p.status === 'leave' ? 'On leave' : p.status === 'suspended' ? 'Suspended' : p.post ?? ''}</div>
                      </td>
                      {p.shifts.map((server, di) => {
                        const s = shiftOf(p.staffId, week.days[di], server)
                        return (
                        <td key={di} className="px-1 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => change(pi, di)}
                            aria-label={`${p.name}, ${week.days[di]}: ${s ? LOOK[s].label : 'empty'}. Click to change.`}
                            className={cx(
                              'h-11 w-[72px] rounded-lg text-[15px] font-semibold transition-colors',
                              s ? LOOK[s].className : 'border border-dashed border-border text-muted-foreground hover:bg-muted',
                            )}
                          >
                            {s ? LOOK[s].label : '—'}
                          </button>
                        </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </Page>
  )
}
