import { useEffect, useState, useRef } from 'react'
import { X, MapPin, ScanLine, Download, Edit, MapIcon, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import L from 'leaflet'
import { api } from '../services/api'
import { useCanManageCheckpoints } from '../stores/useAuthStore'
import type { Checkpoint } from '../types'
import { CardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

function escapeHtmlForPrint(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const statusColor: Record<string, string> = {
  active: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  inactive: 'bg-muted text-muted-foreground',
  deactivated: 'bg-muted text-muted-foreground',
}

interface AddressSuggestion {
  id: string
  mainText: string
  secondaryText: string
  description: string
  latitude: string
  longitude: string
  prefillName?: boolean
}

function getBrowserLocation(
  options: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

function isPositionUnavailable(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as GeolocationPositionError).code === 2
  )
}

function isPositionTimeout(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as GeolocationPositionError).code === 3
  )
}

function getStatus(cp: Checkpoint): string {
  if (!cp.active) return 'deactivated'
  if (cp.lastScan) {
    const hours = (Date.now() - new Date(cp.lastScan).getTime()) / 3600000
    if (hours > 2) return 'warning'
  }
  return 'active'
}

function QRCell({ data }: { data: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, data, {
        width: 120, margin: 1,
        color: { dark: '#ffffff', light: '#111827' },
      }).catch(() => {})
    }
  }, [data])
  return <canvas ref={ref} width={120} height={120} className="mx-auto rounded-lg" />
}

export default function Checkpoints() {
  const navigate = useNavigate()
  const mapRef = useRef<HTMLDivElement>(null)
  const canManage = useCanManageCheckpoints()
  const leafletMapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const radiusRef = useRef<L.Circle | null>(null)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const patrolIntervalOptions = [5, 10, 15, 20, 25, 30, 45, 60]
  const emptyForm = { name: '', code: '', latitude: '', longitude: '', radiusMeters: '10', expectedIntervalMinutes: '30', scheduledTimeIn: '06:00', scheduledTimeOut: '' }
  const [form, setForm] = useState(emptyForm)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressResults, setAddressResults] = useState<AddressSuggestion[]>([])
  const [searchingAddress, setSearchingAddress] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [resolvingCurrentLocation, setResolvingCurrentLocation] = useState(false)
  const [locationInfo, setLocationInfo] = useState('')
  const [actionError, setActionError] = useState('')
  const [geoError, setGeoError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.checkpoints.list().then(setCheckpoints).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!showModal || !mapRef.current || leafletMapRef.current) return

    const initialLat = Number(form.latitude) || 6.5244
    const initialLng = Number(form.longitude) || 3.3792
    const initialRadius = Number(form.radiusMeters) || 10

    const markerIcon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;background:oklch(0.70 0.14 220);border:3px solid white;border-radius:9999px;box-shadow:0 4px 14px rgba(0,0,0,0.35);"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })

    const map = L.map(mapRef.current, {
      center: [initialLat, initialLng],
      zoom: 16,
      zoomControl: false,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const marker = L.marker([initialLat, initialLng], {
      draggable: true,
      icon: markerIcon,
    }).addTo(map)
    const radiusCircle = L.circle([initialLat, initialLng], {
      color: 'oklch(0.70 0.14 220)',
      fillColor: 'oklch(0.70 0.14 220 / 0.15)',
      fillOpacity: 0.18,
      radius: initialRadius,
      weight: 2,
    }).addTo(map)

    const syncPosition = (lat: number, lng: number) => {
      setForm((current) => ({
        ...current,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
      }))
    }

    marker.on('dragend', () => {
      const pos = marker.getLatLng()
      radiusCircle.setLatLng(pos)
      syncPosition(pos.lat, pos.lng)
      setLocationInfo('Pin moved. The checkpoint will be saved at the selected map point.')
    })

    map.on('click', (event) => {
      marker.setLatLng(event.latlng)
      radiusCircle.setLatLng(event.latlng)
      syncPosition(event.latlng.lat, event.latlng.lng)
      setLocationInfo('Map location updated. You can drag the pin again if you need to refine it.')
    })

    leafletMapRef.current = map
    markerRef.current = marker
    radiusRef.current = radiusCircle

    window.setTimeout(() => {
      map.invalidateSize()
    }, 0)

    return () => {
      map.remove()
      leafletMapRef.current = null
      markerRef.current = null
      radiusRef.current = null
    }
  }, [showModal])

  useEffect(() => {
    if (!showModal) return
    const map = leafletMapRef.current
    const marker = markerRef.current
    const radiusCircle = radiusRef.current
    if (!map || !marker || !radiusCircle) return

    const lat = Number(form.latitude)
    const lng = Number(form.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const next = L.latLng(lat, lng)
      marker.setLatLng(next)
      radiusCircle.setLatLng(next)
      map.panTo(next, { animate: true, duration: 0.35 })
    }
  }, [form.latitude, form.longitude, showModal])

  useEffect(() => {
    const radiusCircle = radiusRef.current
    if (!radiusCircle || !showModal) return

    const radius = Number(form.radiusMeters) || 10
    radiusCircle.setRadius(radius)
  }, [form.radiusMeters, showModal])

  useEffect(() => {
    if (!showModal) return
    if (addressQuery.trim().length < 3) {
      setAddressResults([])
      setAddressError('')
      return
    }

    let active = true
    const timer = window.setTimeout(async () => {
      try {
      setSearchingAddress(true)
      setAddressError('')
      setLocationInfo('')
      const coordinateMatch = addressQuery.match(
        /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
      )

        if (coordinateMatch) {
          const latitude = coordinateMatch[1]
          const longitude = coordinateMatch[2]
          setAddressResults([
            {
              id: `${latitude},${longitude}`,
              mainText: 'Use typed coordinates',
              secondaryText: `${latitude}, ${longitude}`,
              description: `${latitude}, ${longitude}`,
              latitude,
              longitude,
              prefillName: false,
            },
          ])
          return
        }

        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ng&q=${encodeURIComponent(addressQuery)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        )

        if (!response.ok) {
          throw new Error('Could not search for that address.')
        }

        const results = await response.json()
        if (!active) return

        setAddressResults(
          (Array.isArray(results) ? results : []).map((result: any) => ({
            id: String(result.place_id),
            mainText:
              String(result.display_name || '')
                .split(',')
                .slice(0, 2)
                .join(', ') || 'Selected address',
            secondaryText:
              String(result.display_name || '')
                .split(',')
                .slice(2)
                .join(',')
                .trim(),
            description: result.display_name || '',
            latitude: result.lat,
            longitude: result.lon,
            prefillName: true,
          })),
        )
      } catch (error) {
        if (!active) return
        setAddressResults([])
        setAddressError(
          error instanceof Error
            ? error.message
            : 'Could not load place suggestions.',
        )
      } finally {
        if (active) setSearchingAddress(false)
      }
    }, 400)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [addressQuery, showModal])

  const handleToggleActive = async (cp: Checkpoint) => {
    try {
      setActionError('')
      await api.checkpoints.update(cp.id, { active: !cp.active })
      setCheckpoints(prev => prev.map(c => c.id === cp.id ? { ...c, active: !cp.active } : c))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to update checkpoint')
    }
  }

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setGeoError('Your browser does not support location access. Type an address or paste coordinates instead.')
      return
    }
    if (!window.isSecureContext) {
      setGeoError('Location requires a secure connection. Open the web app on HTTPS or localhost, then try again.')
      return
    }

    try {
      setResolvingCurrentLocation(true)
      setGeoError('')
      setAddressError('')
      setLocationInfo('')

      if ('permissions' in navigator) {
        try {
          const permission = await navigator.permissions.query({
            name: 'geolocation',
          } as PermissionDescriptor)
          if (permission.state === 'denied') {
            throw Object.assign(
              new Error('Geolocation permission is blocked.'),
              { code: 1 },
            )
          }
        } catch (permissionError: any) {
          if (permissionError?.code === 1) throw permissionError
        }
      }

      let position: GeolocationPosition
      try {
        position = await getBrowserLocation({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 5000,
        })
      } catch (highAccuracyError: any) {
        if (
          isPositionTimeout(highAccuracyError) ||
          isPositionUnavailable(highAccuracyError)
        ) {
          try {
            position = await getBrowserLocation({
              enableHighAccuracy: false,
              timeout: 15000,
              maximumAge: 120000,
            })
          } catch (fallbackError: any) {
            if (
              isPositionTimeout(fallbackError) ||
              isPositionUnavailable(fallbackError)
            ) {
              position = await getBrowserLocation({
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 10 * 60 * 1000,
              })
            } else {
              throw fallbackError
            }
          }
        } else {
          throw highAccuracyError
        }
      }

      const latitude = String(position.coords.latitude)
      const longitude = String(position.coords.longitude)
      const accuracy = Math.max(25, Math.ceil(position.coords.accuracy || 0))
      const suggestedRadius = Math.max(
        Number(form.radiusMeters) || 10,
        Math.ceil((accuracy + 25) / 25) * 25,
      )

      setForm((f) => ({
        ...f,
        latitude,
        longitude,
        radiusMeters: String(suggestedRadius),
      }))
      setLocationInfo(`Current location captured. GPS accuracy is about ${accuracy}m, so checkpoint radius was adjusted to ${suggestedRadius}m.`)
    } catch (error: any) {
      let errorMessage = 'Could not get your current location.'
      if (error?.code === 1) {
        errorMessage = 'Location permission denied. Click the lock icon in your browser address bar and allow location access, then try again.'
      } else if (error?.code === 2) {
        errorMessage = 'Location is still unavailable after retrying. Turn on device Location Services, allow browser location access, or paste latitude,longitude into the address box.'
      } else if (error?.code === 3) {
        errorMessage = 'Location request timed out after retrying. Move closer to a window, check your network, or paste latitude,longitude into the address box.'
      } else if (error?.message?.includes('secure')) {
        errorMessage = 'Location requires a secure connection (HTTPS). Use localhost or connect via HTTPS.'
      }
      setGeoError(errorMessage)
    } finally {
      setResolvingCurrentLocation(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      await api.checkpoints.create({
        name: form.name,
        code: form.code,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        radiusMeters: parseInt(form.radiusMeters),
        expectedIntervalMinutes: parseInt(form.expectedIntervalMinutes),
        scheduledTimeIn: form.scheduledTimeIn,
        scheduledTimeOut: form.scheduledTimeOut,
      })
      setShowModal(false)
      setForm(emptyForm)
      setAddressQuery('')
      setAddressResults([])
      setAddressError('')
      setLocationInfo('')
      setGeoError('')
      const list = await api.checkpoints.list()
      setCheckpoints(list)
    } catch (error) {
      setAddressError(
        error instanceof Error
          ? error.message
          : 'Could not create checkpoint. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddressSelect = (result: AddressSuggestion) => {
    setForm((f) => ({
      ...f,
      name: f.name || (result.prefillName ? result.mainText : f.name),
      latitude: result.latitude,
      longitude: result.longitude,
    }))
    setAddressQuery(result.description || `${result.latitude}, ${result.longitude}`)
    setAddressResults([])
    setAddressError('')
    setLocationInfo('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Locations</div>
          <h1 className="text-2xl font-semibold">Checkpoints</h1>
        </div>
        {canManage && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <ScanLine className="h-4 w-4" /> Add Checkpoint
          </button>
        )}
      </div>
      {actionError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : checkpoints.length === 0 ? (
        <EmptyState
          icon={<MapIcon className="h-7 w-7" />}
          title="No checkpoints yet"
          description="Create your first checkpoint to start tracking patrols."
          action={canManage ? (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <ScanLine className="h-4 w-4" /> Add Checkpoint
            </button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {checkpoints.map((cp) => {
            const status = getStatus(cp)
            const qrData = `${window.location.origin}/checkpoints/${cp.id}`
            const deactivated = !cp.active
            return (
              <div key={cp.id} className={`rounded-xl border bg-card p-5 transition-opacity ${deactivated ? 'border-muted opacity-40' : 'border-border'}`}>
                <button
                  onClick={() => navigate(`/checkpoints/${cp.id}`)}
                  className="w-full text-left"
                >
                  <div className="flex flex-col items-center gap-3">
                    <QRCell data={qrData} />
                    <div className="text-center">
                      <div className="font-semibold text-base">{cp.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{cp.code}</div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor[status]}`}>
                      {deactivated ? 'Deactivated' : status}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {cp.latitude != null && cp.longitude != null
                      ? `${cp.latitude.toFixed(4)}, ${cp.longitude.toFixed(4)}`
                      : 'Uses location geofence'}
                  </div>
                </button>

                <div className="mt-4 flex items-center justify-center gap-2 border-t border-border pt-4">
                  <button
                    onClick={async () => {
                      try {
                        const dlUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#ffffff', light: '#111827' } })
                        const a = document.createElement('a')
                        a.href = dlUrl
                        a.download = `${cp.code}-qrcode.png`
                        a.click()
                      } catch {
                        setActionError('Could not generate QR code image.')
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                    title="Download QR Code"
                  >
                    <Download className="h-3.5 w-3.5" /> QR
                  </button>
                  <button
                    onClick={() => {
                      const printWindow = window.open('', '_blank', 'width=480,height=640')
                      if (!printWindow) {
                        setActionError('Allow pop-ups to print QR codes.')
                        return
                      }
                      const safeName = escapeHtmlForPrint(cp.name)
                      const safeCode = escapeHtmlForPrint(cp.code)
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>${safeCode} QR Code</title>
                            <style>
                              body { font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#ffffff; color:#111827; }
                              .sheet { text-align:center; padding:24px; }
                              .sheet img { width:280px; height:280px; display:block; margin:0 auto 16px; }
                              .code { font-family: monospace; font-size: 14px; margin-top: 8px; }
                            </style>
                          </head>
                          <body>
                            <div class="sheet">
                              <img src="" alt="QR code" id="qr-image" />
                              <h1>${safeName}</h1>
                              <div class="code">${safeCode}</div>
                            </div>
                          </body>
                        </html>
                      `)
                      void QRCode.toDataURL(qrData, { width: 600, margin: 2, color: { dark: '#111827', light: '#ffffff' } })
                        .then((url) => {
                          const image = printWindow.document.getElementById('qr-image') as HTMLImageElement | null
                          if (image) image.src = url
                          printWindow.document.close()
                          printWindow.focus()
                          printWindow.print()
                        })
                        .catch(() => {
                          printWindow.close()
                          setActionError('Could not generate printable QR code.')
                        })
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                    title="Print QR Code"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print
                  </button>
                  <button
                    onClick={() => navigate(`/checkpoints/${cp.id}`)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/15 text-primary px-2.5 py-1.5 text-xs font-medium hover:bg-primary/25"
                  >
                    Details
                  </button>
                  {canManage && (
                    <>
                      <button
                        onClick={() => navigate(`/checkpoints/${cp.id}`)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                        title="Edit"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(cp)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-accent ${deactivated ? 'text-success border-success/30 hover:bg-success/10' : 'text-warning border-warning/30 hover:bg-warning/10'}`}
                        title={deactivated ? 'Activate' : 'Deactivate'}
                      >
                        {deactivated ? 'Activate' : 'Deactivate'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-semibold">New Checkpoint</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {geoError ? (
              <div className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <p className="text-sm font-medium text-destructive">Location Error</p>
                <p className="mt-1 text-xs text-destructive/90">{geoError}</p>
              </div>
            ) : null}

            <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
              {resolvingCurrentLocation ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
                  <div className="flex flex-col items-center gap-3">
                    <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted-foreground/25 border-t-primary" />
                    <p className="text-sm text-muted-foreground">Getting your current location...</p>
                    <p className="text-xs text-muted-foreground/60">This may take a few seconds. Ensure location access is enabled.</p>
                  </div>
                </div>
              ) : (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-muted-foreground">Find location</label>
                  <button
                    type="button"
                    onClick={() => void handleUseCurrentLocation()}
                    disabled={resolvingCurrentLocation || submitting}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent"
                  >
                    {resolvingCurrentLocation ? 'Getting location...' : 'Use current location'}
                  </button>
                </div>
                <input
                  value={addressQuery}
                  onChange={e => setAddressQuery(e.target.value)}
                  placeholder="Type an address or paste latitude,longitude"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Search for a place, use your current location, then adjust the pin on the map if needed.
                </div>
                {locationInfo ? (
                  <div className="mt-2 rounded-lg border border-info/20 bg-info/10 px-3 py-2 text-[11px] text-info">
                    {locationInfo}
                  </div>
                ) : null}
                <div className="mt-2 rounded-lg border border-border bg-background">
                  {searchingAddress ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Searching addresses...</div>
                  ) : addressError ? (
                    <div className="px-3 py-2 text-xs text-destructive">{addressError}</div>
                  ) : addressResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No location selected yet.</div>
                  ) : (
                    addressResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleAddressSelect(result)}
                        className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                      >
                        <div className="font-medium">{result.mainText}</div>
                        {result.secondaryText ? (
                          <div className="text-xs text-muted-foreground">{result.secondaryText}</div>
                        ) : null}
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {result.latitude}, {result.longitude}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Checkpoint map</label>
                  <span className="text-[11px] text-muted-foreground">Tap map or drag pin to refine location</span>
                </div>
                <div ref={mapRef} className="mt-2 h-52 overflow-hidden rounded-xl border border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Code</label>
                <input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Latitude</label>
                  <input required type="number" step="any" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Longitude</label>
                  <input required type="number" step="any" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Radius (m)</label>
                  <input type="number" value={form.radiusMeters} onChange={e => setForm(f => ({ ...f, radiusMeters: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Patrol Interval (min)</label>
                  <select value={form.expectedIntervalMinutes} onChange={e => setForm(f => ({ ...f, expectedIntervalMinutes: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {patrolIntervalOptions.map((minutes) => (
                      <option key={minutes} value={minutes}>{minutes} minutes</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">Inactivity alert triggers when no scan is received in this interval.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Scheduled Time In</label>
                  <input type="time" value={form.scheduledTimeIn} onChange={e => setForm(f => ({ ...f, scheduledTimeIn: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Scheduled Time Out</label>
                  <input type="time" value={form.scheduledTimeOut} onChange={e => setForm(f => ({ ...f, scheduledTimeOut: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              </div>
              )}
              <div className="border-t border-border px-6 py-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" />
                      Creating checkpoint...
                    </>
                  ) : (
                    'Create Checkpoint'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
