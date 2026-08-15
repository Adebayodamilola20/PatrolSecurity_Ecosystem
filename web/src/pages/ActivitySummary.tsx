import { useEffect, useState, useCallback } from 'react'
import { formatDate } from '../utils/format'
import { TableSkeleton } from '../components/ui/Skeleton'
import { api } from '../services/api'
import { Download, Filter, FileSpreadsheet, FileText, Users, MapPin } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'

const ACTIVITY_TYPES = [
  { value: '', label: 'All Activities' },
  { value: 'clock_in', label: 'Clock-In' },
  { value: 'clock_out', label: 'Clock-Out' },
  { value: 'patrol_scan', label: 'Patrol Scan' },
  { value: 'incident', label: 'Incident' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'dar', label: 'Daily Activity Report' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'pass_on_log_ack', label: 'Pass-On Log Ack' },
  { value: 'post_order_ack', label: 'Post Order Ack' },
  { value: 'visitor_check_in', label: 'Visitor Check-In' },
  { value: 'visitor_check_out', label: 'Visitor Check-Out' },
  { value: 'truck_check_in', label: 'Truck Check-In' },
  { value: 'truck_check_out', label: 'Truck Check-Out' },
]

export default function ActivitySummary() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activityType, setActivityType] = useState('')
  const [officerId, setOfficerId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [officers, setOfficers] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (activityType) params.activityType = activityType
      if (officerId) params.officerId = officerId
      if (siteId) params.siteId = siteId
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const data = await api.activity.list(params)
      setRows(data)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [activityType, officerId, siteId, startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    api.users.list().then(setOfficers).catch(() => {})
    api.sites.list().then(setSites).catch(() => {})
  }, [])

  const exportUrl = (format: string) => {
    const params: Record<string, string> = { format }
    if (activityType) params.activityType = activityType
    if (officerId) params.officerId = officerId
    if (siteId) params.siteId = siteId
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    return api.activity.exportCsv(params)
  }

  const activityDot = (type: string) => {
    const map: Record<string, string> = {
      clock_in: 'bg-green-500',
      clock_out: 'bg-orange-500',
      patrol_scan: 'bg-blue-500',
      incident: 'bg-red-500',
      maintenance: 'bg-yellow-500',
      dar: 'bg-purple-500',
      emergency: 'bg-red-600',
      pass_on_log_ack: 'bg-cyan-500',
      post_order_ack: 'bg-indigo-500',
      visitor_check_in: 'bg-teal-500',
      visitor_check_out: 'bg-teal-700',
      truck_check_in: 'bg-amber-500',
      truck_check_out: 'bg-amber-700',
    }
    return map[type] ?? 'bg-gray-400'
  }

  const totalScans = rows.reduce(
    (sum, row) => sum + (row.activityType === 'patrol_scan' ? Number(row.count || 0) : 0),
    0,
  )
  const totalCount = rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const formatDateTime = (value: string) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return formatDate(date)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Monitoring"
        title="Site Activity Summary"
        blurb="What happened at each location over the period you choose."
        actions={
          <>
            <a href={exportUrl('csv')} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </a>
            <a href={exportUrl('xlsx')} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
              <FileText className="h-4 w-4" /> Excel
            </a>
            <a href={exportUrl('pdf')} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
              <Download className="h-4 w-4" /> PDF
            </a>
          </>
        }
      />

      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        <select
          value={activityType}
          onChange={(e) => setActivityType(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          {ACTIVITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={officerId}
            onChange={(e) => setOfficerId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All Officers</option>
            {officers.map((o: any) => (
              <option key={o.id || o._id} value={o.id || o._id}>
                {o.name || o.email}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All Sites</option>
            {sites.map((s: any) => (
              <option key={s.id || s._id} value={s.id || s._id}>
                {s.name || s.siteName || s.address}
              </option>
            ))}
          </select>
        </div>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Start date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="End date"
        />
        <button
          type="button"
          onClick={fetchData}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Apply Filter
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm">
          <div className="font-medium">Activity records</div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <span>Scans: <span className="font-semibold text-foreground">{totalScans}</span></span>
            <span>Total Count: <span className="font-semibold text-foreground">{totalCount}</span></span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Scans</th>
                <th className="px-4 py-3 font-medium">Date/Time</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // A skeleton rather than the word "Loading": every request to
                // the backend costs the best part of a second from here, and a
                // page that greys out its own shape reads as quicker than one
                // that goes blank, at identical speed.
                <tr>
                  <td colSpan={6} className="px-4 py-4">
                    <TableSkeleton rows={6} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No activity records found.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="px-4 py-3">{row.site || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.location || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.activityType === 'patrol_scan' ? row.count : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(row.time || row.occurredAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${activityDot(row.activityType)}`} />
                        <span>{row.activity}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{row.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
