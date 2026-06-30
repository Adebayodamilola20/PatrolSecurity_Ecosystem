import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { formatDate } from '../utils/format'

export default function Guards() {
  const fetcher = useCallback(() => api.guards.list(), [])
  const { data, loading, error } = useClientData(fetcher)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">My Guards</h1>
        <p className="text-sm text-muted-foreground">Guards assigned to your sites.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <EmptyState icon={Users} title="Couldn't load guards" description={error} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Users} title="No guards yet" description="No guards are currently assigned to your sites." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Guard</th>
                <th className="px-4 py-2 font-medium">Site</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2">
                    <Link to={`/guards/${g.id}`} className="font-medium hover:underline">
                      {g.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{g.siteLabel || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        g.onShift
                          ? 'rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success'
                          : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                      }
                    >
                      {g.onShift ? 'On shift' : 'Off'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {g.lastSeenAt ? formatDate(new Date(g.lastSeenAt)) : '—'}
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
