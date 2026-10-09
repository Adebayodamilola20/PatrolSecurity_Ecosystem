import { useCallback } from 'react'
import { MapPin } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { Card } from '../components/ui/Card'
import { formatDate } from '../utils/format'

export default function Checkpoints() {
  const fetcher = useCallback(() => api.checkpoints.list(), [])
  const { data, loading, error } = useClientData(fetcher)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Checkpoints</h1>
        <p className="text-sm text-muted-foreground">Checkpoints on your sites and recent activity.</p>
      </div>

      {/* TODO: Leaflet map of checkpoints (leaflet is already a dependency). */}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <EmptyState icon={MapPin} title="Couldn't load checkpoints" description={error} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={MapPin} title="No checkpoints" description="No checkpoints are configured for your sites." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.siteLabel || c.code}</p>
                </div>
                {c.hitRate != null ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">{c.hitRate}%</span>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Last scan: {c.lastScanAt ? formatDate(new Date(c.lastScanAt)) : '—'}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
