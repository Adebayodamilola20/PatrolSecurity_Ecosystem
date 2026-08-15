import { useCallback } from 'react'
import { Users, ScanLine, MapPin, Activity } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import { StatCard } from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import { formatTime } from '../utils/format'
import { PageHeader } from '../components/ui/PageHeader'

export default function Overview() {
  const fetcher = useCallback(() => api.overview(), [])
  const { data, loading, error } = useClientData(fetcher)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        blurb="Live snapshot of your sites and guards."
      />

      {error ? (
        <EmptyState
          icon={Activity}
          title="Couldn't load overview"
          description={error}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Guards on duty"
            value={loading ? '—' : `${data?.guardsOnDuty ?? 0}/${data?.totalGuards ?? 0}`}
          />
          <StatCard label="Scans today" value={loading ? '—' : (data?.scansToday ?? 0)} />
          <StatCard
            label="Coverage today"
            value={loading ? '—' : data?.coveragePct != null ? `${data.coveragePct}%` : '—'}
          />
          <StatCard
            label="Last scan"
            value={loading ? '—' : formatTime(data?.lastScanAt ? new Date(data.lastScanAt) : null)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Quick icon={Users} label="My Guards" to="/guards" />
        <Quick icon={ScanLine} label="Patrol Activity" to="/scans" />
        <Quick icon={MapPin} label="Checkpoints" to="/checkpoints" />
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

function Quick({ icon: Icon, label, to }: { icon: LucideIcon; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}
