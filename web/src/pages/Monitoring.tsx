import { PatrolMap } from '../components/PatrolMap'

export default function Monitoring() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Live</div>
        <h1 className="text-2xl font-semibold">Live Monitoring</h1>
      </div>
      <div className="rounded-xl border border-border bg-card p-2 h-[calc(100vh-200px)]">
        <PatrolMap />
      </div>
    </div>
  )
}
