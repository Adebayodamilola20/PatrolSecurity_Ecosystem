import { useCallback, useEffect, useRef } from 'react'
import { MapPin, ShieldCheck, ShieldAlert, Download } from 'lucide-react'
import QRCode from 'qrcode'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { Card } from '../components/ui/Card'
import { formatDate } from '../utils/format'
import type { ClientSubLocation } from '../types'

// QR data mirrors the staff dashboard's format: the scanner app only reads
// the trailing ID, so the origin the QR was rendered on doesn't matter.
function qrDataFor(pointId: string) {
  return `${window.location.origin}/checkpoints/${pointId}`
}

function QRCell({ data, size = 88 }: { data: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, data, {
        width: size, margin: 1,
        color: { dark: '#ffffff', light: '#111827' },
      }).catch(() => {})
    }
  }, [data, size])
  return <canvas ref={ref} width={size} height={size} className="shrink-0 rounded-lg" />
}

async function downloadQr(point: ClientSubLocation) {
  try {
    const url = await QRCode.toDataURL(qrDataFor(point.id), {
      width: 300, margin: 2, color: { dark: '#ffffff', light: '#111827' },
    })
    const a = document.createElement('a')
    a.href = url
    a.download = `${point.code}-qrcode.png`
    a.click()
  } catch {
    // Non-critical: the on-screen QR is still available.
  }
}

function VerifiedBadge({ point }: { point: ClientSubLocation }) {
  if (!point.lastScanAt) {
    return <span className="text-[11px] text-muted-foreground">No patrols yet</span>
  }
  return (
    <>
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-medium ${point.lastScanVerified ? 'text-success' : 'text-warning'}`}
      >
        {point.lastScanVerified ? (
          <ShieldCheck className="h-3.5 w-3.5" />
        ) : (
          <ShieldAlert className="h-3.5 w-3.5" />
        )}
        {point.lastScanVerified ? 'Verified' : 'Unverified'}
      </span>
      <p className="text-[11px] text-muted-foreground">
        {formatDate(new Date(point.lastScanAt))}
      </p>
    </>
  )
}

export default function Locations() {
  const fetcher = useCallback(() => api.sites.list(), [])
  const { data, loading, error } = useClientData(fetcher)
  const sites = data?.sites ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Locations</h1>
        <p className="text-sm text-muted-foreground">
          Your protected locations and the patrol points inside each of them. These are managed by your security provider.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <EmptyState icon={MapPin} title="Couldn't load locations" description={error} />
      ) : sites.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No locations yet"
          description="Your security provider hasn't added any locations to your account yet."
        />
      ) : (
        <div className="space-y-4">
          {sites.map((site) => (
            <Card key={site.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <p className="truncate font-semibold">{site.name}</p>
                  </div>
                  {(site.address || site.location) ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {site.address || site.location}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {site.verifiedToday}/{site.scansToday}
                  </p>
                  <p className="text-[11px] text-muted-foreground">patrols verified today</p>
                </div>
              </div>

              {site.locationQr ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <QRCell data={qrDataFor(site.locationQr.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Location QR — {site.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {site.locationQr.scansToday} patrol{site.locationQr.scansToday === 1 ? '' : 's'} today
                    </p>
                    <div className="mt-1">
                      <VerifiedBadge point={site.locationQr} />
                    </div>
                    <button
                      onClick={() => void downloadQr(site.locationQr!)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                    >
                      <Download className="h-3.5 w-3.5" /> Download QR
                    </button>
                  </div>
                </div>
              ) : null}

              {site.subLocations.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  No patrol points configured at this location yet.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {site.subLocations.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <QRCell data={qrDataFor(sub.id)} size={64} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{sub.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {sub.scansToday} patrol{sub.scansToday === 1 ? '' : 's'} today
                          </p>
                          <button
                            onClick={() => void downloadQr(sub)}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent"
                          >
                            <Download className="h-3 w-3" /> QR
                          </button>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <VerifiedBadge point={sub} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
