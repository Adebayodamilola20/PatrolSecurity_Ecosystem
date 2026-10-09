import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { api } from '../services/api'
import type { Handover } from '../types'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { formatDate } from '../utils/format'
import { photoSrc } from '../utils/photo'
import { ClipboardCheck } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'

const statuses = ['pending', 'accepted', 'closed'] as const

export default function Handovers() {
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setHandovers(await api.handovers.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const updateStatus = async (id: string, status: string) => {
    setSaving(id)
    try {
      await api.handovers.updateStatus(id, status)
      await load()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Handovers"
        blurb="Shift-to-shift notes officers leave for whoever relieves them."
      />

      {loading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : handovers.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-7 w-7" />}
          title="No handovers yet"
          description="Guards will submit shift handovers here for control room review."
        />
      ) : (
        <div className="space-y-3">
          {handovers.map((handover) => (
            <div key={handover.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{handover.siteLabel || handover.checkpointName || 'Site handover'}</div>
                  <div className="text-sm text-muted-foreground">
                    {handover.fromUserName} to {handover.toUserName || 'Next available guard'} · {formatDate(handover.createdAt)}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                  handover.status === 'accepted'
                    ? 'bg-success/15 text-success'
                    : handover.status === 'closed'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-warning/15 text-warning'
                }`}>
                  {handover.status}
                </span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Summary</div>
                  <div>{handover.summary}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Open Issues</div>
                  <div>{handover.openIssues || 'None recorded'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Equipment</div>
                  <div>{handover.equipmentStatus || 'No update'}</div>
                </div>
              </div>
              {photoSrc(handover.photoUrl) ? (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" /> Photo attached
                  </div>
                  <img
                    src={photoSrc(handover.photoUrl)!}
                    alt="Handover"
                    loading="lazy"
                    className="h-24 w-24 rounded-lg border border-border object-cover"
                  />
                </div>
              ) : null}
              <div className="mt-4 flex gap-2">
                {statuses.map((status) => (
                  <button
                    key={status}
                    disabled={saving === handover.id || handover.status === status}
                    onClick={() => void updateStatus(handover.id, status)}
                    className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    Mark {status}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
