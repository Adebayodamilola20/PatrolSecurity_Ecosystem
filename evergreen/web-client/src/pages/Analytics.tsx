import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Building2, AlertTriangle } from 'lucide-react'
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
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { Card, StatCard } from '../components/ui/Card'
import type { AnalyticsSummary } from '../types'

const RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
]

/** Chart axis label: "Jul 3" rather than the raw ISO day key. */
function shortDay(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const tooltipStyle = {
  backgroundColor: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: '0.5rem',
  color: 'var(--color-popover-foreground)',
  fontSize: '12px',
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="h-64 w-full">{children}</div>
    </Card>
  )
}

export default function Analytics() {
  const [days, setDays] = useState(30)
  const [siteId, setSiteId] = useState('')
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The location list drives the filter. Clients with a single location never
  // see the picker — there is nothing to choose between.
  const sitesFetcher = useCallback(() => api.sites.list(), [])
  const { data: siteData } = useClientData(sitesFetcher)
  const sites = siteData?.sites ?? []

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.analytics
      .summary({ days, siteId: siteId || undefined })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [days, siteId])

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
          How your locations have been patrolled. Every figure is counted from real patrol records — nothing is estimated.
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
        {sites.length > 1 ? (
          <div className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              aria-label="Location"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">All Locations</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {data?.truncated ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          This range holds more records than a single query returns. Figures below are partial — try a shorter range or a single location.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load analytics" description={error} />
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Patrols"
              value={data.totals.patrols}
              hint={`across ${data.totals.sites} location${data.totals.sites === 1 ? '' : 's'}`}
            />
            <StatCard
              label="GPS verified"
              value={data.totals.verificationRate === null ? '—' : `${data.totals.verificationRate}%`}
              hint={`${data.totals.verifiedPatrols} of ${data.totals.patrols} patrols`}
            />
            <StatCard
              label="Incidents"
              value={data.totals.incidents}
              hint={`${data.totals.openIncidents} still open`}
            />
            <StatCard
              label="Reports"
              value={data.totals.reports}
              hint="filed in this range"
            />
          </div>

          {!hasActivity ? (
            <EmptyState
              icon={BarChart3}
              title="No activity in this range"
              description="No patrols or incidents were recorded for the selected filters. Try a wider date range."
            />
          ) : (
            <>
              <ChartCard
                title="Patrol activity"
                subtitle="Patrols recorded per day, and how many were confirmed on-site by GPS."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="clientPatrolFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="patrols" name="Patrols" stroke="var(--color-primary)" fill="url(#clientPatrolFill)" strokeWidth={2} />
                    <Area type="monotone" dataKey="verified" name="GPS verified" stroke="var(--color-success)" fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <Card>
                  <h2 className="mb-3 text-sm font-semibold">Patrols by location</h2>
                  {data.sites.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      No patrols recorded at your locations in this range.
                    </p>
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
                </Card>

                {data.totals.incidents > 0 ? (
                  <ChartCard title="Incidents reported" subtitle="Incidents raised at your locations each day.">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" minTickGap={16} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} stroke="var(--color-border)" />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-accent)' }} />
                        <Bar dataKey="incidents" name="Incidents" fill="var(--color-warning)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                ) : (
                  <Card>
                    <h2 className="mb-1 text-sm font-semibold">Incidents reported</h2>
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      No incidents were reported at your locations in this range.
                    </p>
                  </Card>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
