import { useCallback } from 'react'
import { Users, ShieldCheck } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import { StatCard } from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'

// Clients see guard NUMBERS only — never names, photos or personal details.
// Individual guard identities live on the staff dashboard.
export default function Guards() {
  const fetcher = useCallback(() => api.guards.stats(), [])
  const { data, loading, error } = useClientData(fetcher)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Guard Coverage</h1>
        <p className="text-sm text-muted-foreground">
          Live staffing numbers across your locations, updated as guards clock in and out.
        </p>
      </div>

      {error ? (
        <EmptyState icon={Users} title="Couldn't load guard coverage" description={error} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Assigned Guards" value={loading ? '—' : String(data?.assigned ?? 0)} />
          <StatCard label="Clocked In" value={loading ? '—' : String(data?.clockedIn ?? 0)} />
          <StatCard
            label="Pending"
            value={loading ? '—' : String(data?.pending ?? 0)}
            hint="Assigned but not yet clocked in"
          />
        </div>
      )}

      {!error && !loading && data ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          {data.clockedIn} of {data.assigned} guards are currently on duty at your locations.
        </div>
      ) : null}
    </div>
  )
}
