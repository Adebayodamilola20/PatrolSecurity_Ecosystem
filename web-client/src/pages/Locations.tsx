import { useCallback } from 'react'
import { MapPin, ShieldCheck, ShieldAlert, QrCode } from 'lucide-react'
import { api } from '../services/api'
import { useClientData } from '../hooks/useClientData'
import EmptyState from '../components/ui/EmptyState'
import { Card } from '../components/ui/Card'
import { formatDate } from '../utils/format'

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

              {site.subLocations.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  No patrol points configured at this location yet.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {site.subLocations.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <QrCode className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{sub.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {sub.scansToday} patrol{sub.scansToday === 1 ? '' : 's'} today
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {sub.lastScanAt ? (
                          <>
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium ${sub.lastScanVerified ? 'text-success' : 'text-warning'}`}
                            >
                              {sub.lastScanVerified ? (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              ) : (
                                <ShieldAlert className="h-3.5 w-3.5" />
                              )}
                              {sub.lastScanVerified ? 'Verified' : 'Unverified'}
                            </span>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDate(new Date(sub.lastScanAt))}
                            </p>
                          </>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">No patrols yet</span>
                        )}
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
