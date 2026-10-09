import { PatrolMap } from '../components/PatrolMap'
import { PageHeader } from '../components/ui/PageHeader'

export default function Monitoring() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Live"
        title="Live Monitoring"
        blurb="Where every officer on shift is, right now."
      />
      <div className="rounded-xl border border-border bg-card p-2 h-[calc(100vh-200px)] md:h-[calc(100vh-200px)] min-h-[300px]">
        <PatrolMap />
      </div>
    </div>
  )
}
