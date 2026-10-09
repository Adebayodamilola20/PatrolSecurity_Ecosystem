import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Users,
  FileText,
  MapPin,
  Building2,
  BarChart3,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../services/api'
import { EmptyState } from '../components/ui/EmptyState'
import { StatsCardSkeleton } from '../components/ui/Skeleton'
import type { AnalyticsSummary } from '../types'

const RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
]

/**
 * Clients and sites come back from endpoints that predate the typed API and
 * disagree on their id field. Only what the filters read is modelled here.
 */
type FilterOption = {
  id?: string
  _id?: string
  convexId?: string
  name?: string
  address?: string
}

const optionId = (o: FilterOption) => o.id ?? o.convexId ?? o._id ?? ''

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive',
  high: 'bg-destructive/15 text-destructive',
  medium: 'bg-warning/15 text-warning',
  low: 'bg-info/15 text-info',
}

/** Chart axis label: "Jul 3" rather than the raw ISO day key. */
function shortDay(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'primary',
}: {
  icon: typeof Activity
  label: string
  value: string
  hint?: string
  tone?: 'primary' | 'success' | 'warning' | 'info' | 'destructive'
}) {
  const tones: Record<string, string> = {
    primary: 'bg-primary/15 text-primary',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    info: 'bg-info/15 text-info',
    destructive: 'bg-destructive/15 text-destructive',
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/**
 * Recharts renders into SVG, so theme tokens have to be passed as explicit
 * colour strings. Reading the CSS variables keeps the charts correct in both
 * themes instead of hard-coding a palette that only suits one.
 */
function ChartFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="h-64 w-full">{children}</div>
    </div>
  )
}

const tooltipStyle = {
  backgroundColor: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: '0.5rem',
  color: 'var(--color-popover-foreground)',
  fontSize: '12px',
}

export default function Analytics() {
  const [days, setDays] = useState(30)
  const [clientId, setClientId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [clients, setClients] = useState<FilterOption[]>([])
  const [sites, setSites] = useState<FilterOption[]>([])
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.clients.list().then(setClients).catch(() => setClients([]))
  }, [])

  // Sites depend on the selected client so the two filters can't contradict
  // each other (a site from client A while client B is selected).
  useEffect(() => {
    api.sites
      .list(clientId ? { clientId } : undefined)
      .then(setSites)
      .catch(() => setSites([]))
  }, [clientId])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.analytics
      .summary({ days, clientId: clientId || undefined, siteId: siteId || undefined })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [days, clientId, siteId])

  useEffect(() => { load() }, [load])

  const chartData = useMemo(
    () => (data?.series ?? []).map((p) => ({ ...p, label: shortDay(p.date) })),
    [data],
  )

  const hasActivity = (data?.totals.patrols ?? 0) > 0 || (data?.totals.incidents ?? 0) > 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Patrol performance across your accounts. Every figure is counted from recorded patrols, shifts, incidents and reports.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Date range"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            aria-label="Client"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value)
              // The old site belongs to the old client; carrying it over would
              // ask the API for a contradiction.
              setSiteId('')
            }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={optionId(c)} value={optionId(c)}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            aria-label="Location"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All Locations</option>
            {sites.map((s) => (
              <option key={optionId(s)} value={optionId(s)}>{s.name || s.address}</option>
            ))}
          </select>
        </div>
      </div>

      {data?.truncated ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          This range holds more records than a single query returns. Figures below are partial — narrow the range or filter to a location for exact numbers.
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <StatsCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7" />}
          title="Couldn't load analytics"
          description={error}
          action={
            <button onClick={load} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent">
              Try again
            </button>
          }
        />
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              icon={Activity}
              label="Patrols"
              value={String(data.totals.patrols)}
              hint={`across ${data.totals.sites} location${data.totals.sites === 1 ? '' : 's'}`}
            />
            <StatCard
              icon={ShieldCheck}
              tone="success"
              label="GPS verified"
              value={data.totals.verificationRate === null ? '—' : `${data.totals.verificationRate}%`}
              hint={`${data.totals.verifiedPatrols} of ${data.totals.patrols}`}
            />
            <StatCard
              icon={AlertTriangle}
              tone={data.totals.openIncidents > 0 ? 'destructive' : 'warning'}
              label="Incidents"
              value={String(data.totals.incidents)}
              hint={`${data.totals.openIncidents} still open`}
            />
            <StatCard
              icon={Clock}
              tone="info"
              label="Hours on duty"
              value={String(data.totals.dutyHours)}
              hint={data.totals.avgShiftHours === null ? 'no closed shifts' : `${data.totals.avgShiftHours}h average shift`}
            />
            <StatCard
              icon={Users}
              label="Guards active"
              value={String(data.totals.activeGuards)}
              hint={`${data.totals.shifts} shift${data.totals.shifts === 1 ? '' : 's'} started`}
            />
            <StatCard
              icon={FileText}
              tone="info"
              label="Reports filed"
              value={String(data.totals.reports)}
            />
          </div>

          {!hasActivity ? (
            <EmptyState
              icon={<BarChart3 className="h-7 w-7" />}
              title="No activity in this range"
              description="No patrols or incidents were recorded for the selected filters. Try a wider date range."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <ChartFrame title="Patrol activity" subtitle="Patrols recorded per day, and how many passed the GPS geofence check.">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="patrolFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="patrols" name="Patrols" stroke="var(--color-primary)" fill="url(#patrolFill)" strokeWidth={2} />
                      <Area type="monotone" dataKey="verified" name="GPS verified" stroke="var(--color-success)" fill="transparent" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartFrame>

                <ChartFrame title="Incidents reported" subtitle="Incidents raised by guards each day in this range.">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-accent)' }} />
                      <Bar dataKey="incidents" name="Incidents" fill="var(--color-warning)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h2 className="mb-3 text-sm font-semibold">Location performance</h2>
                  {data.sites.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">No patrols recorded at any location in this range.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs text-muted-foreground">
                            <th className="pb-2 font-medium">Location</th>
                            <th className="pb-2 text-right font-medium">Patrols</th>
                            <th className="pb-2 text-right font-medium">GPS verified</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.sites.map((s) => (
                            <tr key={s.id}>
                              <td className="py-2 pr-3">{s.name}</td>
                              <td className="py-2 text-right tabular-nums">{s.patrols}</td>
                              <td className="py-2 text-right">
                                <span className={`inline-block rounded px-1.5 py-0.5 text-xs tabular-nums ${
                                  s.verificationRate === null ? 'text-muted-foreground'
                                    : s.verificationRate >= 90 ? 'bg-success/15 text-success'
                                    : s.verificationRate >= 60 ? 'bg-warning/15 text-warning'
                                    : 'bg-destructive/15 text-destructive'
                                }`}>
                                  {s.verificationRate === null ? '—' : `${s.verificationRate}%`}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="mb-3 text-sm font-semibold">Most active guards</h2>
                    {data.topGuards.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">No patrols recorded in this range.</p>
                    ) : (
                      <ul className="space-y-2">
                        {data.topGuards.map((g) => (
                          <li key={g.id} className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm">{g.name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {g.patrols} patrol{g.patrols === 1 ? '' : 's'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {data.incidentsByCategory.length > 0 ? (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <h2 className="mb-3 text-sm font-semibold">Incidents by type</h2>
                      <ul className="space-y-2">
                        {data.incidentsByCategory.map((c) => (
                          <li key={c.category} className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm">{c.category}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.count}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                        {data.incidentsBySeverity.map((s) => (
                          <span key={s.severity} className={`rounded px-2 py-0.5 text-[11px] capitalize ${SEVERITY_TONE[s.severity] ?? 'bg-muted text-muted-foreground'}`}>
                            {s.severity}: {s.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
