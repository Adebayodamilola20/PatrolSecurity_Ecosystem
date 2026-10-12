import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { DAYS, POSTS, ROSTER, type Shift } from './sample'
import { Button, Figures, SampleBanner, Section, Select } from './ui'
import { cx } from './format'

const SHIFT: Record<Shift, { label: string; className: string }> = {
  D: { label: 'Day', className: 'bg-primary/12 text-primary' },
  N: { label: 'Night', className: 'bg-primary text-primary-foreground' },
  O: { label: 'Off', className: 'bg-muted text-muted-foreground' },
}

export default function FinanceRosters() {
  const contracted = POSTS.reduce((s, p) => s + p.contracted, 0)
  const filled = POSTS.reduce((s, p) => s + p.filled, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People"
        title="Rosters"
        blurb="Who works where, on which days, day or night. Payroll uses this to know who worked."
        actions={
          <>
            <Select options={['Jos branch', 'Abuja branch', 'Lagos branch', 'Port Harcourt branch', 'Owerri branch', 'Yola branch', 'Lafia branch']} />
            <Button variant="outline"><Printer className="h-4 w-4" /> Print</Button>
          </>
        }
      />
      <SampleBanner />

      <Figures
        items={[
          { label: 'Posts contracted', value: String(contracted), note: 'Jos branch' },
          { label: 'Posts filled', value: String(filled) },
          { label: 'Short', value: String(contracted - filled), note: 'Plateau Grand Mall', tone: contracted > filled ? 'amber' : undefined },
          { label: 'On leave this week', value: '1' },
        ]}
      />

      <Section
        title="Week of 13 October"
        action={
          <div className="flex gap-1">
            <button type="button" aria-label="Previous week" className="rounded-md border border-border p-1.5 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next week" className="rounded-md border border-border p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium sm:pl-5">Guard</th>
                {DAYS.map((d) => (
                  <th key={d} className="px-1 py-2.5 text-center font-medium">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROSTER.map((r) => (
                <tr key={r.name}>
                  <td className="px-4 py-2.5 sm:pl-5">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.site}</div>
                  </td>
                  {r.week.map((s, i) => (
                    <td key={i} className="px-1 py-2.5 text-center">
                      <span className={cx('inline-block w-14 rounded py-1 text-xs font-semibold', SHIFT[s].className)}>{SHIFT[s].label}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Posts by site">
        <ul className="divide-y divide-border">
          {POSTS.map((p) => (
            <li key={p.site} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-sm sm:px-5">
              <div>
                <div className="font-medium">{p.site}</div>
                <div className="mt-2 h-1.5 max-w-sm rounded-full bg-muted">
                  <div className={cx('h-1.5 rounded-full', p.filled < p.contracted ? 'bg-warning' : 'bg-primary')} style={{ width: `${(p.filled / p.contracted) * 100}%` }} />
                </div>
              </div>
              <span className={cx('tabular-nums', p.filled < p.contracted && 'font-semibold text-warning')}>
                {p.filled} of {p.contracted} filled
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
