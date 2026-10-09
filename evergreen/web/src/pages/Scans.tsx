import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, QrCode, Search, User2 } from 'lucide-react'
import { formatDate } from '../utils/format'
import { useScanStore, useScanWebSocket } from '../stores/useScanStore'
import { TableSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

type DateFilter = 'all' | 'today' | 'yesterday' | 'custom'

function dayBounds(d: Date) {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime(),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime(),
  }
}

// Resolve the chosen date filter into the selected day (or null for "all").
function selectedDay(filter: DateFilter, customDate: string): Date | null {
  if (filter === 'today') return new Date()
  if (filter === 'yesterday') {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d
  }
  if (filter === 'custom' && customDate) {
    const [yy, mm, dd] = customDate.split('-').map(Number)
    if (yy && mm && dd) return new Date(yy, mm - 1, dd)
  }
  return null
}

// ISO start/end params sent to the backend so the FULL history is queried by
// date, not just the most-recent rows already loaded.
function rangeParams(filter: DateFilter, customDate: string): Record<string, string> {
  const d = selectedDay(filter, customDate)
  if (!d) return {}
  const { start, end } = dayBounds(d)
  return { startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString() }
}

function inDateRange(iso: string, filter: DateFilter, customDate: string): boolean {
  if (filter === 'all') return true
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  if (filter === 'today') {
    const { start, end } = dayBounds(new Date())
    return t >= start && t <= end
  }
  if (filter === 'yesterday') {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const { start, end } = dayBounds(d)
    return t >= start && t <= end
  }
  // custom
  if (!customDate) return true
  const [yy, mm, dd] = customDate.split('-').map(Number)
  if (!yy || !mm || !dd) return true
  const { start, end } = dayBounds(new Date(yy, mm - 1, dd))
  return t >= start && t <= end
}

export default function Scans() {
  const { scans, loading, fetchScans } = useScanStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'verified' | 'flagged'>('all')
  const [guard, setGuard] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customDate, setCustomDate] = useState('')
  useScanWebSocket()

  // Refetch from the backend by date range so the full history is searchable,
  // not only the most-recent scans already in the store.
  useEffect(() => {
    fetchScans(rangeParams(dateFilter, customDate))
  }, [dateFilter, customDate, fetchScans])

  // Build the guard list from the scans actually in the history.
  const guards = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of scans) {
      if (s.officerId && !map.has(s.officerId)) map.set(s.officerId, s.officerName || s.officerId)
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [scans])

  const filteredScans = useMemo(() => {
    return scans.filter((s) => {
      const matchesQuery = !query || [
        s.officerName,
        s.checkpointName,
        s.checkpointCode,
        s.id,
      ].filter(Boolean).some((value) => value.toLowerCase().includes(query.toLowerCase()))
      const matchesStatus =
        status === 'all' ||
        (status === 'verified' ? s.gpsValid : !s.gpsValid)
      const matchesGuard = guard === 'all' || s.officerId === guard
      const matchesDate = inDateRange(s.scannedAt, dateFilter, customDate)
      return matchesQuery && matchesStatus && matchesGuard && matchesDate
    })
  }, [scans, query, status, guard, dateFilter, customDate])

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
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by officer, checkpoint, code, or scan ID"
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="relative">
            <User2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={guard}
              onChange={(e) => setGuard(e.target.value)}
              className="rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm min-w-[170px]"
            >
              <option value="all">All guards</option>
              {guards.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            {(['all', 'verified', 'flagged'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setStatus(item)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  status === item
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-muted-foreground hover:bg-accent'
                }`}
              >
                {item === 'all' ? 'All' : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Date:</span>
          {([['all', 'All'], ['today', 'Today'], ['yesterday', 'Yesterday']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setDateFilter(key); setCustomDate('') }}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                dateFilter === key
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent'
              }`}
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            value={customDate}
            onChange={(e) => { setCustomDate(e.target.value); setDateFilter(e.target.value ? 'custom' : 'all') }}
            className={`rounded-lg border bg-card px-3 py-1.5 text-sm ${
              dateFilter === 'custom' ? 'border-primary text-primary' : 'border-border text-muted-foreground'
            }`}
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : filteredScans.length === 0 ? (
        <EmptyState
          icon={<QrCode className="h-7 w-7" />}
          title={scans.length === 0 ? 'No patrol scans yet' : 'No scans match this filter'}
          description={scans.length === 0
            ? 'Scans will appear here once officers start patrolling checkpoints.'
            : 'Try a different search term or status filter.'}
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
                {filteredScans.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="border-t border-border hover:bg-accent/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">#{s.id.slice(0, 6).toUpperCase()}</td>
                    <td className="px-4 py-3">{s.officerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.checkpointName}
                      {s.checkpointActive === false && <span className="ml-1 text-[10px] text-muted-foreground/50">(Deactivated)</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(s.scannedAt)}
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
