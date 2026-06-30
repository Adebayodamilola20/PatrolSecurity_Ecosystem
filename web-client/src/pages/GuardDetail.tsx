import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import { Card } from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import { formatDate } from '../utils/format'

export default function GuardDetail() {
  const { id = '' } = useParams()
  const fetcher = useCallback(() => api.guards.get(id), [id])
  const { data, loading, error } = useClientData(fetcher)

  return (
    <div className="space-y-5">
      <Link to="/guards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to guards
      </Link>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error || !data ? (
        <EmptyState icon={Users} title="Couldn't load guard" description={error || 'Not found'} />
      ) : (
        <>
          <div>
            <h1 className="text-xl font-semibold">{data.name}</h1>
            <p className="text-sm text-muted-foreground">{data.siteLabel || 'Unassigned'}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-xs uppercase text-muted-foreground">Status</p>
              <p className="mt-1 text-sm font-medium">{data.onShift ? 'On shift' : 'Off duty'}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-muted-foreground">Last seen</p>
              <p className="mt-1 text-sm font-medium">
                {data.lastSeenAt ? formatDate(new Date(data.lastSeenAt)) : '—'}
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
