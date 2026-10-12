import { Plus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { APPLICANTS, STAGES } from './sample'
import { Button, Figures, Pill, SampleBanner, Select } from './ui'

const GUARANTOR = {
  verified: <Pill tone="green">Guarantor verified</Pill>,
  pending: <Pill tone="amber">Guarantor pending</Pill>,
  missing: <Pill tone="neutral">No guarantor yet</Pill>,
}

export default function FinanceRecruitment() {
  const inProgress = APPLICANTS.filter((a) => a.stage !== 'hired').length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People"
        title="Recruitment"
        blurb="New applicants from first contact to hired. Nobody is posted to a site until their guarantor is verified."
        actions={
          <>
            <Select options={['All branches', 'Jos', 'Abuja', 'Lagos', 'Port Harcourt', 'Owerri', 'Yola', 'Lafia']} />
            <Button><Plus className="h-4 w-4" /> Add applicant</Button>
          </>
        }
      />
      <SampleBanner />

      <Figures
        items={[
          { label: 'In progress', value: String(inProgress) },
          { label: 'Hired this month', value: String(APPLICANTS.filter((a) => a.stage === 'hired').length) },
          { label: 'Waiting on guarantor', value: String(APPLICANTS.filter((a) => a.guarantor !== 'verified').length), tone: 'amber' },
          { label: 'In training', value: String(APPLICANTS.filter((a) => a.stage === 'training').length) },
        ]}
      />

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[900px] grid-cols-5 gap-3">
          {STAGES.map((stage) => {
            const people = APPLICANTS.filter((a) => a.stage === stage.key)
            return (
              <section key={stage.key} className="rounded-lg border border-border bg-muted/40">
                <header className="flex items-center justify-between px-3 py-2.5">
                  <h2 className="text-sm font-semibold">{stage.label}</h2>
                  <span className="rounded bg-card px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{people.length}</span>
                </header>
                <ul className="space-y-2 px-2 pb-2">
                  {people.map((a) => (
                    <li key={a.name} className="rounded-md border border-border bg-card p-3 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
                      <div className="font-medium">{a.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {a.branch} · applied {a.applied}
                      </div>
                      <div className="mt-2">{GUARANTOR[a.guarantor]}</div>
                    </li>
                  ))}
                  {people.length === 0 && <li className="px-1 py-4 text-center text-xs text-muted-foreground">Nobody here</li>}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
