import { useCallback, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { ListSkeleton, LoadingNote } from '../components/ui/Skeleton'
import { formatDate } from '../utils/format'

export default function Scans() {
  // Date range filter — reuses the same pattern as the staff Patrol History page.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const fetcher = useCallback(() => {
    const params: Record<string, string> = {}
    if (from) params.from = from
    if (to) params.to = to
    return api.scans.list(params)
  }, [from, to])

  const { data, loading, error } = useClientData(fetcher)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Patrol Activity</h1>
        <p className="text-sm text-muted-foreground">Checkpoint scans across your sites.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <div className="space-y-3">
          <LoadingNote label="Loading patrol activity…" />
          <ListSkeleton rows={6} />
        </div>
      ) : error ? (
        <EmptyState icon={ScanLine} title="Couldn't load scans" description={error} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={ScanLine} title="No scans found" description="No patrol scans in this range." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Guard</th>
                <th className="px-4 py-2 font-medium">Checkpoint</th>
                <th className="px-4 py-2 font-medium">Site</th>
                <th className="px-4 py-2 font-medium">GPS</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(new Date(s.scannedAt))}</td>
                  <td className="px-4 py-2">{s.guardName}</td>
                  <td className="px-4 py-2">{s.checkpointName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.siteLabel || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={s.gpsValid ? 'text-success' : 'text-warning'}>
                      {s.gpsValid ? 'Valid' : 'Off-location'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
