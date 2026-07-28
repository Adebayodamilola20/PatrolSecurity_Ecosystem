import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  X,
  ArrowLeft,
  Building2,
  MapPin,
  Plus,
  QrCode as QrCodeIcon,
  Download,
  Printer,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react'
import QRCode from 'qrcode'
import L from 'leaflet'
import { api } from '../services/api'
import { resolvePlaceLocation, searchPlaces } from '../services/placesSearch'
import type { PlaceSuggestion } from '../services/placesSearch'
import { useAuthStore } from '../stores/useAuthStore'
import { CardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

interface SubLocation {
  id: string
  name: string
  code: string
  hasOwnGps: boolean
  active: boolean
  scansToday: number
  verifiedToday: number
  lastScanAt: string | null
  lastScanVerified: boolean | null
}

interface AssignedGuard {
  id: string
  name: string
  phone: string
  active: boolean
  onDuty: boolean
}

interface ClientSite {
  id: string
  name: string
  location: string
  address: string | null
  latitude: number | null
  longitude: number | null
  radiusMeters: number | null
  active: boolean
  scansToday: number
  verifiedToday: number
  /** The location's own QR point, auto-created with the location. */
  locationQr: SubLocation | null
  assignedGuards: AssignedGuard[]
  subLocations: SubLocation[]
}

interface ClientDetailData {
  id: string
  name: string
  email: string
  phone: string
  active: boolean
  createdAt: string
  portalLogins: Array<{ id: string; email: string; active: boolean }>
  sites: ClientSite[]
}

function escapeHtmlForPrint(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function QRCell({ data, size = 96 }: { data: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, data, {
        width: size, margin: 1,
        color: { dark: '#111827', light: '#ffffff' },
      }).catch(() => {})
    }
  }, [data, size])
  return <canvas ref={ref} width={size} height={size} className="rounded-lg" />
}

type AddressSuggestion = PlaceSuggestion

const emptyLocationForm = {
  name: '',
  address: '',
  latitude: '',
  longitude: '',
  radiusMeters: '150',
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const canManage = role === 'admin'

  const [detail, setDetail] = useState<ClientDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Add-location modal state
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [locationForm, setLocationForm] = useState(emptyLocationForm)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressResults, setAddressResults] = useState<AddressSuggestion[]>([])
  const [searchingAddress, setSearchingAddress] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [submittingLocation, setSubmittingLocation] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const radiusRef = useRef<L.Circle | null>(null)

  // Add-sub-location modal state
  const [subLocationSite, setSubLocationSite] = useState<ClientSite | null>(null)
  const [subLocationName, setSubLocationName] = useState('')
  const [subLocationInterval, setSubLocationInterval] = useState('30')
  const [submittingSubLocation, setSubmittingSubLocation] = useState(false)
  const [subLocationError, setSubLocationError] = useState('')

  // Guard-assignment state: the pool of assignable guards plus, per location,
  // the guard picked in the dropdown and whether a request is in flight.
  const [guardPool, setGuardPool] = useState<Array<{ id: string; convexId?: string; name: string }>>([])
  const [pendingGuard, setPendingGuard] = useState<Record<string, string>>({})
  const [assignBusySiteId, setAssignBusySiteId] = useState('')
  // A guard already posted to another location triggers a blocking popup so
  // staff can't silently double-assign them.
  const [assignConflict, setAssignConflict] = useState('')

  const load = () => {
    if (!id) return
    api.clients.get(id)
      .then((data) => {
        setDetail(data)
        setLoadError('')
        // Auto-expand when there is only one location.
        if (data?.sites?.length === 1) {
          setExpanded({ [data.sites[0].id]: true })
        }
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Could not load this client.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // The guard pool for the assign dropdown (GET /users is admin-only, which
  // matches canManage).
  useEffect(() => {
    if (!canManage) return
    api.users.list()
      .then((users) => setGuardPool(
        (users || []).filter((u: any) => u.role === 'guard' && u.active),
      ))
      .catch(() => setGuardPool([]))
  }, [canManage])

  const assignGuard = async (site: ClientSite) => {
    const guardId = pendingGuard[site.id]
    if (!guardId) return
    try {
      setAssignBusySiteId(site.id)
      setActionError('')
      await api.siteAssignments.assign(site.id, guardId)
      setPendingGuard((prev) => ({ ...prev, [site.id]: '' }))
      load()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not assign the guard.'
      // Already-assigned-elsewhere gets a modal; everything else the inline banner.
      if (/already assigned/i.test(message)) {
        setAssignConflict(message)
      } else {
        setActionError(message)
      }
    } finally {
      setAssignBusySiteId('')
    }
  }

  const unassignGuard = async (site: ClientSite, guard: AssignedGuard) => {
    try {
      setAssignBusySiteId(site.id)
      setActionError('')
      await api.siteAssignments.unassign(site.id, guard.id)
      load()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not remove the guard.')
    } finally {
      setAssignBusySiteId('')
    }
  }

  // Leaflet picker for the add-location modal (same pattern as the old
  // Checkpoints page: search an address, then refine by dragging the pin).
  useEffect(() => {
    if (!showLocationModal || !mapRef.current || leafletMapRef.current) return

    const initialLat = Number(locationForm.latitude) || 6.5244
    const initialLng = Number(locationForm.longitude) || 3.3792
    const initialRadius = Number(locationForm.radiusMeters) || 150

    const markerIcon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;background:oklch(0.70 0.14 220);border:3px solid white;border-radius:9999px;box-shadow:0 4px 14px rgba(0,0,0,0.35);"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })

    const map = L.map(mapRef.current, {
      center: [initialLat, initialLng],
      zoom: 15,
      zoomControl: false,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const marker = L.marker([initialLat, initialLng], { draggable: true, icon: markerIcon }).addTo(map)
    const radiusCircle = L.circle([initialLat, initialLng], {
      color: 'oklch(0.70 0.14 220)',
      fillColor: 'oklch(0.70 0.14 220 / 0.15)',
      fillOpacity: 0.18,
      radius: initialRadius,
      weight: 2,
    }).addTo(map)

    const syncPosition = (lat: number, lng: number) => {
      setLocationForm((current) => ({
        ...current,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
      }))
    }

    marker.on('dragend', () => {
      const pos = marker.getLatLng()
      radiusCircle.setLatLng(pos)
      syncPosition(pos.lat, pos.lng)
    })
    map.on('click', (event) => {
      marker.setLatLng(event.latlng)
      radiusCircle.setLatLng(event.latlng)
      syncPosition(event.latlng.lat, event.latlng.lng)
    })

    leafletMapRef.current = map
    markerRef.current = marker
    radiusRef.current = radiusCircle
    window.setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      leafletMapRef.current = null
      markerRef.current = null
      radiusRef.current = null
    }
  }, [showLocationModal])

  useEffect(() => {
    if (!showLocationModal) return
    const map = leafletMapRef.current
    const marker = markerRef.current
    const radiusCircle = radiusRef.current
    if (!map || !marker || !radiusCircle) return
    const lat = Number(locationForm.latitude)
    const lng = Number(locationForm.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      const next = L.latLng(lat, lng)
      marker.setLatLng(next)
      radiusCircle.setLatLng(next)
      map.panTo(next, { animate: true, duration: 0.35 })
    }
  }, [locationForm.latitude, locationForm.longitude, showLocationModal])

  useEffect(() => {
    const radiusCircle = radiusRef.current
    if (!radiusCircle || !showLocationModal) return
    radiusCircle.setRadius(Number(locationForm.radiusMeters) || 150)
  }, [locationForm.radiusMeters, showLocationModal])

  useEffect(() => {
    if (!showLocationModal) return
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
        const coordinateMatch = addressQuery.match(
          /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
        )
        if (coordinateMatch) {
          setAddressResults([
            {
              id: `${coordinateMatch[1]},${coordinateMatch[2]}`,
              mainText: 'Use typed coordinates',
              secondaryText: `${coordinateMatch[1]}, ${coordinateMatch[2]}`,
              description: `${coordinateMatch[1]}, ${coordinateMatch[2]}`,
              latitude: coordinateMatch[1],
              longitude: coordinateMatch[2],
            },
          ])
          return
        }
        const suggestions = await searchPlaces(addressQuery)
        if (!active) return
        setAddressResults(suggestions)
      } catch (error) {
        if (!active) return
        setAddressResults([])
        setAddressError(
          error instanceof Error ? error.message : 'Could not load place suggestions.',
        )
      } finally {
        if (active) setSearchingAddress(false)
      }
    }, 400)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [addressQuery, showLocationModal])

  const openLocationModal = () => {
    setLocationForm(emptyLocationForm)
    setAddressQuery('')
    setAddressResults([])
    setAddressError('')
    setShowLocationModal(true)
  }

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!detail) return
    const lat = parseFloat(locationForm.latitude)
    const lng = parseFloat(locationForm.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setAddressError('Pick the location on the map (or search an address) so scans can be verified against it.')
      return
    }
    try {
      setSubmittingLocation(true)
      setAddressError('')
      await api.sites.create({
        clientId: detail.id,
        name: locationForm.name.trim(),
        location: locationForm.address.trim() || locationForm.name.trim(),
        address: locationForm.address.trim(),
        latitude: lat,
        longitude: lng,
        radiusMeters: parseInt(locationForm.radiusMeters) || 150,
      })
      setShowLocationModal(false)
      load()
    } catch (error) {
      setAddressError(
        error instanceof Error ? error.message : 'Could not create the location.',
      )
    } finally {
      setSubmittingLocation(false)
    }
  }

  const handleCreateSubLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subLocationSite) return
    try {
      setSubmittingSubLocation(true)
      setSubLocationError('')
      await api.checkpoints.create({
        siteId: subLocationSite.id,
        name: subLocationName.trim(),
        expectedIntervalMinutes: parseInt(subLocationInterval) || 30,
      })
      setExpanded((prev) => ({ ...prev, [subLocationSite.id]: true }))
      setSubLocationSite(null)
      setSubLocationName('')
      load()
    } catch (error) {
      setSubLocationError(
        error instanceof Error ? error.message : 'Could not create the sub-location.',
      )
    } finally {
      setSubmittingSubLocation(false)
    }
  }

  const downloadQr = async (sub: SubLocation) => {
    try {
      const qrData = `${window.location.origin}/checkpoints/${sub.id}`
      const dlUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#111827', light: '#ffffff' } })
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = `${sub.code}-qrcode.png`
      a.click()
    } catch {
      setActionError('Could not generate QR code image.')
    }
  }

  const printQr = (site: ClientSite, sub: SubLocation) => {
    const qrData = `${window.location.origin}/checkpoints/${sub.id}`
    const printWindow = window.open('', '_blank', 'width=480,height=640')
    if (!printWindow) {
      setActionError('Allow pop-ups to print QR codes.')
      return
    }
    const safeName = escapeHtmlForPrint(sub.name)
    const safeSite = escapeHtmlForPrint(site.name)
    const safeCode = escapeHtmlForPrint(sub.code)
    printWindow.document.write(`
      <html>
        <head>
          <title>${safeCode} QR Code</title>
          <style>
            body { font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#ffffff; color:#111827; }
            .sheet { text-align:center; padding:24px; }
            .sheet img { width:280px; height:280px; display:block; margin:0 auto 16px; }
            .site { color:#6b7280; font-size:14px; margin-top:4px; }
            .code { font-family: monospace; font-size: 13px; margin-top: 8px; color:#6b7280; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <img src="" alt="QR code" id="qr-image" />
            <h1>${safeName}</h1>
            <div class="site">${safeSite}</div>
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
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  if (loadError || !detail) {
    return (
      <EmptyState
        icon={<Building2 className="h-7 w-7" />}
        title="Client not found"
        description={loadError || 'This client account does not exist.'}
        action={
          <button
            onClick={() => navigate('/clients')}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Clients
          </button>
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/clients')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All Clients
      </button>

      {/* Client account header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{detail.name}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                Portal login: <span className="font-mono">{detail.portalLogins[0]?.email ?? detail.email}</span>
              </div>
              {detail.phone ? (
                <div className="text-sm text-muted-foreground">{detail.phone}</div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${detail.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
              {detail.active ? 'Active' : 'Inactive'}
            </span>
            {canManage && (
              <button
                onClick={async () => {
                  try {
                    setActionError('')
                    await api.clients.update(detail.id, { active: !detail.active })
                    load()
                  } catch (error) {
                    setActionError(error instanceof Error ? error.message : 'Could not update the client.')
                  }
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs hover:bg-accent ${detail.active ? 'text-warning border-warning/30' : 'text-success border-success/30'}`}
              >
                {detail.active ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Locations</div>
            <div className="text-xl font-semibold">{detail.sites.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Sub-locations</div>
            <div className="text-xl font-semibold">
              {detail.sites.reduce((sum, s) => sum + s.subLocations.length, 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Scans Today</div>
            <div className="text-xl font-semibold">
              {detail.sites.reduce((sum, s) => sum + s.scansToday, 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Verified Today</div>
            <div className="text-xl font-semibold text-success">
              {detail.sites.reduce((sum, s) => sum + s.verifiedToday, 0)}
            </div>
          </div>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      {assignConflict ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h2 className="font-semibold">Guard already assigned</h2>
            </div>
            <div className="px-5 py-4 text-sm text-muted-foreground">{assignConflict}</div>
            <div className="flex justify-end border-t border-border px-5 py-3">
              <button
                onClick={() => setAssignConflict('')}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Locations */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Locations</h2>
        {canManage && (
          <button
            onClick={openLocationModal}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add Location
          </button>
        )}
      </div>

      {detail.sites.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-7 w-7" />}
          title="No locations yet"
          description="Add this client's first location (with its address and map point), then create sub-location QR codes inside it."
          action={canManage ? (
            <button
              onClick={openLocationModal}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add Location
            </button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {detail.sites.map((site) => {
            const isOpen = !!expanded[site.id]
            return (
              <div key={site.id} className={`rounded-xl border bg-card ${site.active ? 'border-border' : 'border-muted opacity-60'}`}>
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [site.id]: !isOpen }))}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <MapPin className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="font-semibold">{site.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {site.address || site.location}
                        {site.latitude != null && site.longitude != null ? (
                          <span className="ml-2 font-mono">
                            {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)} · {site.radiusMeters ?? 150}m geofence
                          </span>
                        ) : (
                          <span className="ml-2 text-warning">no map point — scans can't be GPS-verified</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden text-right sm:block">
                      <div className="text-sm font-semibold">
                        {site.verifiedToday}/{site.scansToday}
                      </div>
                      <div className="text-[11px] text-muted-foreground">verified today</div>
                    </div>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {site.subLocations.length} sub-location{site.subLocations.length === 1 ? '' : 's'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-5 py-4">
                    {site.locationQr && (
                      <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                        <div className="flex items-start gap-3">
                          <QRCell data={`${window.location.origin}/checkpoints/${site.locationQr.id}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <QrCodeIcon className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate font-medium">Location QR — {site.name}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              The location's own scan point. Mount it at the main entrance — scans verify against this location's geofence.
                            </p>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {site.locationQr.scansToday} scan{site.locationQr.scansToday === 1 ? '' : 's'} today
                            </div>
                            {site.locationQr.lastScanAt ? (
                              <div className="mt-1 flex items-center gap-1 text-[11px]">
                                {site.locationQr.lastScanVerified ? (
                                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                                ) : (
                                  <ShieldAlert className="h-3.5 w-3.5 text-warning" />
                                )}
                                <span className={site.locationQr.lastScanVerified ? 'text-success' : 'text-warning'}>
                                  {site.locationQr.lastScanVerified ? 'Verified' : 'Unverified'}
                                </span>
                                <span className="text-muted-foreground">
                                  · {new Date(site.locationQr.lastScanAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 border-t border-primary/20 pt-3">
                          <button
                            onClick={() => void downloadQr(site.locationQr!)}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                            title="Download Location QR Code"
                          >
                            <Download className="h-3.5 w-3.5" /> QR
                          </button>
                          <button
                            onClick={() => printQr(site, site.locationQr!)}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                            title="Print Location QR Code"
                          >
                            <Printer className="h-3.5 w-3.5" /> Print
                          </button>
                          <button
                            onClick={() => navigate(`/checkpoints/${site.locationQr!.id}`)}
                            className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
                          >
                            Scans
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Assigned guards: scans at this location only count for
                        guards posted here, and the client portal's coverage
                        numbers are derived from these assignments. */}
                    <div className="mb-4">
                      <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Assigned Guards</div>
                      {site.assignedGuards.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-warning/40 bg-warning/5 px-3 py-3 text-xs text-warning">
                          No guards posted here yet — assign at least one, or their patrol scans at this location won't be accepted.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {site.assignedGuards.map((guard) => (
                            <span
                              key={guard.id}
                              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                            >
                              <span className={`h-2 w-2 rounded-full ${guard.onDuty ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                              <span className="font-medium">{guard.name}</span>
                              <span className="text-muted-foreground">{guard.onDuty ? 'on duty' : 'off duty'}</span>
                              {canManage && (
                                <button
                                  onClick={() => void unassignGuard(site, guard)}
                                  disabled={assignBusySiteId === site.id}
                                  title={`Remove ${guard.name} from ${site.name}`}
                                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {canManage && (
                        <div className="mt-2 flex items-center gap-2">
                          <select
                            value={pendingGuard[site.id] ?? ''}
                            onChange={(e) => setPendingGuard((prev) => ({ ...prev, [site.id]: e.target.value }))}
                            className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-xs"
                          >
                            <option value="">Select a guard to assign…</option>
                            {guardPool
                              .filter((g) => !site.assignedGuards.some(
                                (a) => a.id === g.id || a.id === g.convexId,
                              ))
                              .map((g) => (
                                <option key={g.id} value={g.convexId ?? g.id}>{g.name}</option>
                              ))}
                          </select>
                          <button
                            onClick={() => void assignGuard(site)}
                            disabled={!pendingGuard[site.id] || assignBusySiteId === site.id}
                            className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {assignBusySiteId === site.id ? 'Saving…' : 'Assign'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Sub-locations & QR codes</div>
                      {canManage && (
                        <button
                          onClick={() => {
                            setSubLocationSite(site)
                            setSubLocationName('')
                            setSubLocationError('')
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Sub-location
                        </button>
                      )}
                    </div>

                    {site.subLocations.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        No sub-locations yet. Add points like Front Gate, Reception, or Generator House — each gets its own QR code.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {site.subLocations.map((sub) => {
                          const qrData = `${window.location.origin}/checkpoints/${sub.id}`
                          return (
                            <div key={sub.id} className={`rounded-lg border p-4 ${sub.active ? 'border-border' : 'border-muted opacity-50'}`}>
                              <div className="flex items-start gap-3">
                                <QRCell data={qrData} />
                                <div className="min-w-0 flex-1">
                                  <button
                                    onClick={() => navigate(`/checkpoints/${sub.id}`)}
                                    className="block w-full truncate text-left font-medium hover:text-primary"
                                  >
                                    {sub.name}
                                  </button>
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    {sub.scansToday} scan{sub.scansToday === 1 ? '' : 's'} today
                                  </div>
                                  {sub.lastScanAt ? (
                                    <div className="mt-1 flex items-center gap-1 text-[11px]">
                                      {sub.lastScanVerified ? (
                                        <ShieldCheck className="h-3.5 w-3.5 text-success" />
                                      ) : (
                                        <ShieldAlert className="h-3.5 w-3.5 text-warning" />
                                      )}
                                      <span className={sub.lastScanVerified ? 'text-success' : 'text-warning'}>
                                        {sub.lastScanVerified ? 'Verified' : 'Unverified'}
                                      </span>
                                      <span className="text-muted-foreground">
                                        · {new Date(sub.lastScanAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="mt-1 text-[11px] text-muted-foreground">Never scanned</div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                                <button
                                  onClick={() => void downloadQr(sub)}
                                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                                  title="Download QR Code"
                                >
                                  <Download className="h-3.5 w-3.5" /> QR
                                </button>
                                <button
                                  onClick={() => printQr(site, sub)}
                                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                                  title="Print QR Code"
                                >
                                  <Printer className="h-3.5 w-3.5" /> Print
                                </button>
                                <button
                                  onClick={() => navigate(`/checkpoints/${sub.id}`)}
                                  className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
                                >
                                  Scans
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Location modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-semibold">New Location for {detail.name}</h2>
              <button onClick={() => setShowLocationModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateLocation} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
                <div>
                  <label className="text-xs text-muted-foreground">Location Name</label>
                  <input required value={locationForm.name} onChange={e => setLocationForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Head Office, Warehouse Lekki"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Address</label>
                  <input value={locationForm.address} onChange={e => setLocationForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Street address shown to the client"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Find on map</label>
                  <input
                    value={addressQuery}
                    onChange={e => setAddressQuery(e.target.value)}
                    placeholder="Search an address or paste latitude,longitude"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  {(searchingAddress || addressError || addressResults.length > 0) && (
                    <div className="mt-2 rounded-lg border border-border bg-background">
                      {searchingAddress ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Searching addresses...</div>
                      ) : addressError ? (
                        <div className="px-3 py-2 text-xs text-destructive">{addressError}</div>
                      ) : (
                        addressResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={async () => {
                              setAddressResults([])
                              setAddressQuery(result.description)
                              try {
                                const place = await resolvePlaceLocation(result)
                                setLocationForm(f => ({
                                  ...f,
                                  address: f.address || place.address,
                                  latitude: place.latitude,
                                  longitude: place.longitude,
                                }))
                              } catch (error) {
                                setAddressError(
                                  error instanceof Error
                                    ? error.message
                                    : 'Could not pinpoint that address.',
                                )
                              }
                            }}
                            className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                          >
                            <div className="font-medium">{result.mainText}</div>
                            {result.secondaryText ? (
                              <div className="text-xs text-muted-foreground">{result.secondaryText}</div>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Map point & geofence</label>
                    <span className="text-[11px] text-muted-foreground">Tap map or drag the pin</span>
                  </div>
                  <div ref={mapRef} className="mt-2 h-52 overflow-hidden rounded-xl border border-border" />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Sub-location scans are verified against this point: a guard's GPS must be inside the geofence radius for the scan to show as "Verified".
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Latitude</label>
                    <input required type="number" step="any" value={locationForm.latitude} onChange={e => setLocationForm(f => ({ ...f, latitude: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Longitude</label>
                    <input required type="number" step="any" value={locationForm.longitude} onChange={e => setLocationForm(f => ({ ...f, longitude: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Geofence (m)</label>
                    <input type="number" min={25} value={locationForm.radiusMeters} onChange={e => setLocationForm(f => ({ ...f, radiusMeters: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <p className="mt-1 text-[11px] text-muted-foreground">Use a bigger radius for large compounds.</p>
                  </div>
                </div>
              </div>
              <div className="border-t border-border px-6 py-4">
                <button
                  type="submit"
                  disabled={submittingLocation}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submittingLocation ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" />
                      Creating location...
                    </>
                  ) : (
                    'Create Location'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Sub-location modal */}
      {subLocationSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-semibold">New Sub-location in {subLocationSite.name}</h2>
              <button onClick={() => setSubLocationSite(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubLocation} className="space-y-3 px-6 py-4">
              <p className="text-xs text-muted-foreground">
                A sub-location is a plain QR point inside this location — like Front Gate, Sitting Room, or Generator House. No coordinates needed: scans are verified against the location's geofence.
              </p>
              {subLocationError ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {subLocationError}
                </div>
              ) : null}
              <div>
                <label className="text-xs text-muted-foreground">Sub-location Name</label>
                <input
                  required
                  autoFocus
                  value={subLocationName}
                  onChange={e => setSubLocationName(e.target.value)}
                  placeholder="e.g. Front Gate"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Patrol Interval (min)</label>
                <select value={subLocationInterval} onChange={e => setSubLocationInterval(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {[5, 10, 15, 20, 25, 30, 45, 60].map((minutes) => (
                    <option key={minutes} value={minutes}>{minutes} minutes</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">Inactivity alert triggers when no scan is received in this interval.</p>
              </div>
              <button
                type="submit"
                disabled={submittingSubLocation}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submittingSubLocation ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" />
                    Creating...
                  </>
                ) : (
                  <>
                    <QrCodeIcon className="h-4 w-4" /> Create & Generate QR
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
