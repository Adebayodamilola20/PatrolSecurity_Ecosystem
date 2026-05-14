import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Filter, Download, QrCode } from 'lucide-react'
import { useScanStore, useScanWebSocket } from '../stores/useScanStore'
import { TableSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

export default function Scans() {
  const { scans, loading, fetchScans } = useScanStore()
  const navigate = useNavigate()
  useScanWebSocket()

  useEffect(() => {
    fetchScans()
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">History</div>
          <h1 className="text-2xl font-semibold">Patrol History</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Complete log of all patrol scans, GPS verification status, and officer activity
          </p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
            <Filter className="h-4 w-4" /> Filter
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : scans.length === 0 ? (
        <EmptyState
          icon={<QrCode className="h-7 w-7" />}
          title="No patrol scans yet"
          description="Scans will appear here once officers start patrolling checkpoints."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Scan ID</th>
                  <th className="text-left px-4 py-3">Officer</th>
                  <th className="text-left px-4 py-3">Checkpoint</th>
                  <th className="text-left px-4 py-3">Time</th>
                  <th className="text-left px-4 py-3">Distance</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="border-t border-border hover:bg-accent/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">#{s.id.slice(0, 6).toUpperCase()}</td>
                    <td className="px-4 py-3">{s.officerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.checkpointName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(s.scannedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.distanceMeters ? `${s.distanceMeters}m` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        s.gpsValid ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                      }`}>
                        {s.gpsValid ? 'Verified' : 'Flagged'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
