import { useCallback, useEffect, useRef, useState } from 'react'
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
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Trash2,
} from 'lucide-react'
import QRCode from 'qrcode'
import L from 'leaflet'
import { formatTime } from '../utils/format'
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
  /** Who holds this particular gate. Several guards may share one point. */
  postedGuards: AssignedGuard[]
  scansToday: number
  verifiedToday: number
  lastScanAt: string | null
  lastScanVerified: boolean | null
}

interface AssignedGuard {
  id: string
  name: string
  phone: string
  role: string
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

// Supervisors can hold a post too, so they belong in the dropdown — but
// posting a supervisor to a gate is a different decision from posting a
// guard, and the names alone don't say which is which.
function guardLabel(person: { name: string; role: string }) {
  return person.role === 'supervisor' ? `${person.name} (supervisor)` : person.name
}

/**
 * Renders a QR code as a labelled sheet: the point, the location under it, and
 * the serial number in bold, all on white.
 *
 * A bare QR image is useless the moment it leaves the screen. Printed and
 * stuck on a wall, nothing on it says which gate it belongs to; once one is
 * damaged or photographed by a guard nobody can match it back to a record
 * without the serial. White because these get photocopied and laminated, and
 * a dark background kills the contrast a scanner needs.
 */
async function buildLabelledQr(opts: {
  locationName: string
  pointName: string
  code: string
  data: string
}): Promise<string> {
  const qrSize = 440
  const qrDataUrl = await QRCode.toDataURL(opts.data, {
    width: qrSize,
    margin: 1,
    color: { dark: '#111827', light: '#ffffff' },
  })
  const qrImage = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('QR image failed to load'))
    img.src = qrDataUrl
  })

  const width = 560
  const padding = 40
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = 662
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(qrImage, (width - qrSize) / 2, padding, qrSize, qrSize)

  // Long gate names would otherwise run off both edges of the sheet.
  const fitFont = (text: string, weight: string, family: string, startSize: number) => {
    let size = startSize
    ctx.font = `${weight} ${size}px ${family}`
    while (size > 12 && ctx.measureText(text).width > width - padding * 2) {
      size -= 1
      ctx.font = `${weight} ${size}px ${family}`
    }
  }

  ctx.textAlign = 'center'
  let y = padding + qrSize + 56

  ctx.fillStyle = '#111827'
  fitFont(opts.pointName, 'bold', 'Arial, sans-serif', 34)
  ctx.fillText(opts.pointName, width / 2, y)

  y += 34
  ctx.fillStyle = '#6b7280'
  fitFont(opts.locationName, 'normal', 'Arial, sans-serif', 22)
  ctx.fillText(opts.locationName, width / 2, y)

  y += 52
  ctx.fillStyle = '#111827'
  fitFont(opts.code, 'bold', '"Courier New", monospace', 34)
  ctx.fillText(opts.code, width / 2, y)

  return canvas.toDataURL('image/png')
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
  const [guardPool, setGuardPool] = useState<Array<{ id: string; convexId?: string; name: string; role: string }>>([])
  const [assignBusySiteId, setAssignBusySiteId] = useState('')
  // Per QR point: which guard is picked, and which point's picker is open.
  // Only one opens at a time — every card showing its own dropdown at once was
  // what made this page feel like a form rather than a list of gates.
  const [pendingSubGuard, setPendingSubGuard] = useState<Record<string, string>>({})
  const [assignBusySubId, setAssignBusySubId] = useState('')
  const [assignOpenPointId, setAssignOpenPointId] = useState('')
  // The location header answers "how many", not "who" — names are one click
  // away for the times somebody needs to take a guard off.
  const [showAssignedNames, setShowAssignedNames] = useState<Record<string, boolean>>({})
  // A guard already posted to another location triggers a blocking popup so
  // staff can't silently double-assign them.
  const [assignConflict, setAssignConflict] = useState('')

  // Delete-location state. The impact is fetched per location when the dialog
  // opens, so staff see the QR codes and postings that stop working.
  const [deleteSite, setDeleteSite] = useState<ClientSite | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<Awaited<ReturnType<typeof api.deletionImpact.site>> | null>(null)
  const [deleteImpactError, setDeleteImpactError] = useState('')
  const [deletingSite, setDeletingSite] = useState(false)
  const [deleteSiteError, setDeleteSiteError] = useState('')

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

  // The pool of people who can be posted (GET /users is admin-only, which
  // matches canManage).
  //
  // This used to keep only `role === 'guard'`, so supervisors — who patrol,
  // clock in and scan here like anyone else — were missing from the dropdown
  // with no explanation. Staff newly created as supervisors simply never
  // appeared and looked like they had not saved. Both roles are listed now,
  // with the role shown so nobody posts a supervisor by accident.
  const loadGuardPool = useCallback(() => {
    if (!canManage) return
    api.users.list()
      .then((users) => setGuardPool(
        (users || [])
          .filter((u: any) => (u.role === 'guard' || u.role === 'supervisor') && u.active)
          .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))),
      ))
      .catch(() => setGuardPool([]))
  }, [canManage])

  useEffect(() => { loadGuardPool() }, [loadGuardPool])

  // Guards are created on another page, often in another tab. Without this a
  // brand-new guard stays missing from the dropdown until a hard reload —
  // which reads as "the system didn't save my guard".
  useEffect(() => {
    const onFocus = () => loadGuardPool()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadGuardPool])

  // Posting to one QR point. A guard can hold several at once, so there is no
  // "already posted" block here — only the parent-location rule can conflict.
  const assignSubGuard = async (sub: SubLocation) => {
    const guardId = pendingSubGuard[sub.id]
    if (!guardId) return
    try {
      setAssignBusySubId(sub.id)
      setActionError('')
      await api.checkpointAssignments.assign(sub.id, guardId)
      setPendingSubGuard((prev) => ({ ...prev, [sub.id]: '' }))
      setAssignOpenPointId('')
      load()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not post the guard here.'
      if (/already assigned/i.test(message)) {
        setAssignConflict(message)
      } else {
        setActionError(message)
      }
    } finally {
      setAssignBusySubId('')
    }
  }

  const unassignSubGuard = async (sub: SubLocation, guard: AssignedGuard) => {
    try {
      setAssignBusySubId(sub.id)
      setActionError('')
      await api.checkpointAssignments.unassign(sub.id, guard.id)
      load()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not remove the guard.')
    } finally {
      setAssignBusySubId('')
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

  // One compact block per QR point: who is posted there, and a link that
  // reveals the picker only when you want to change it. Leaving a dropdown and
  // an Assign button open on every card at once turned a location with three
  // gates into a wall of form controls.
  const renderPointPostings = (point: SubLocation, opts?: { wide?: boolean; readOnly?: boolean }) => {
    const available = guardPool.filter(
      (g) => !point.postedGuards.some((a) => a.id === g.id || a.id === g.convexId),
    )
    const open = assignOpenPointId === point.id
    return (
      // The location's own QR sits in a full-width panel, where a button
      // stretched edge to edge reads as a banner rather than a control.
      <div className={`mt-3 border-t border-border pt-3 ${opts?.wide ? 'max-w-sm' : ''}`}>
        {point.postedGuards.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {point.postedGuards.map((guard) => (
              <span
                key={guard.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-[11px]"
                title={`${guardLabel(guard)} — ${guard.onDuty ? 'on duty now' : 'off duty'}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${guard.onDuty ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                <span>{guard.name}</span>
                {canManage && (
                  <button
                    onClick={() => void unassignSubGuard(point, guard)}
                    disabled={assignBusySubId === point.id}
                    title={`Remove ${guard.name} from ${point.name}`}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* A plain text link was too easy to miss and too small to hit. The
            people running this every day are not reaching for a subtle
            control — the way to add a guard has to look like a button and
            span the card, so there is only one obvious thing to press. */}
        {canManage && !opts?.readOnly && (open ? (
          <div className="space-y-2">
            <select
              autoFocus
              value={pendingSubGuard[point.id] ?? ''}
              onChange={(e) => setPendingSubGuard((prev) => ({ ...prev, [point.id]: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
            >
              <option value="">Choose a guard…</option>
              {available.map((g) => (
                <option key={g.id} value={g.convexId ?? g.id}>{guardLabel(g)}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void assignSubGuard(point)}
                disabled={!pendingSubGuard[point.id] || assignBusySubId === point.id}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assignBusySubId === point.id ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setAssignOpenPointId('')}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAssignOpenPointId(point.id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="h-4 w-4" />
            Assign Guard
          </button>
        ))}

        {/* An empty dropdown is indistinguishable from a broken one. */}
        {canManage && open && available.length === 0 && (
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {guardPool.length === 0
              ? 'No active guards or supervisors exist yet — create one under Users.'
              : 'Everyone available is already assigned here.'}
          </div>
        )}
      </div>
    )
  }

  const openDeleteSite = (site: ClientSite) => {
    setDeleteSite(site)
    setDeleteImpact(null)
    setDeleteImpactError('')
    setDeleteSiteError('')
    api.deletionImpact
      .site(site.id)
      .then(setDeleteImpact)
      .catch((error) =>
        setDeleteImpactError(
          error instanceof Error ? error.message : 'Could not load this location’s record.',
        ),
      )
  }

  const confirmDeleteSite = async () => {
    if (!deleteSite) return
    setDeletingSite(true)
    setDeleteSiteError('')
    try {
      await api.sites.remove(deleteSite.id)
      setDeleteSite(null)
      load()
    } catch (error) {
      setDeleteSiteError(
        error instanceof Error ? error.message : 'Could not delete this location.',
      )
    } finally {
      setDeletingSite(false)
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

  const downloadQr = async (site: ClientSite, sub: SubLocation) => {
    try {
      const qrData = `${window.location.origin}/checkpoints/${sub.id}`
      const dlUrl = await buildLabelledQr({
        locationName: site.name,
        pointName: sub.name,
        code: sub.code,
        data: qrData,
      })
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = `${site.name} - ${sub.name} (${sub.code}).png`
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
            /* The serial is what staff read back when a QR is damaged or
               queried, so it prints as large and as bold as the name. */
            .code { font-family: monospace; font-size: 20px; font-weight: bold; margin-top: 12px; color:#111827; }
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
                      // The whole panel opens the point's history. The Scans
                      // button stays for anyone looking for a labelled way in,
                      // but nobody should have to find it to get there.
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/checkpoints/${site.locationQr!.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            navigate(`/checkpoints/${site.locationQr!.id}`)
                          }
                        }}
                        className="mb-4 cursor-pointer rounded-lg border border-primary/30 bg-primary/5 p-4 transition-colors hover:border-primary/60 hover:bg-primary/10"
                      >
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
                                  · {formatTime(site.locationQr.lastScanAt)}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {/* No assigning here on purpose: guards are assigned
                            to sub-locations only, and this QR is the gate
                            they all pass through. Any posting made here
                            before that rule landed is still shown so it can
                            be taken off. */}
                        <div onClick={(e) => e.stopPropagation()}>
                          {site.locationQr.postedGuards.length > 0
                            ? renderPointPostings(site.locationQr, { wide: true, readOnly: true })
                            : null}
                        </div>
                        <div className="mt-3 rounded-lg border border-primary/20 bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
                          Every guard must scan this QR at the entrance before any sub-location on
                          the same shift. Assign guards on the sub-locations below.
                        </div>
                        <div onClick={(e) => e.stopPropagation()} className="mt-3 flex items-center gap-2 border-t border-primary/20 pt-3">
                          <button
                            onClick={() => void downloadQr(site, site.locationQr!)}
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
                    {/* Everyone with access to this location, read-only.
                        Assigning happens on a QR point below — a second
                        location-wide picker here meant two controls that
                        disagreed with each other, which is exactly how staff
                        ended up pressing ✕ on a gate and watching this list
                        stay put. Removing someone here clears every point. */}
                    <div className="mb-4">
                      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-accent/40 px-3 py-2.5">
                        <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="text-sm">
                          <span className="text-xl font-bold">{site.assignedGuards.length}</span>{' '}
                          guard{site.assignedGuards.length === 1 ? '' : 's'} assigned to this location
                        </div>
                        {site.assignedGuards.length > 0 && (
                          <button
                            onClick={() => setShowAssignedNames((prev) => ({ ...prev, [site.id]: !prev[site.id] }))}
                            className="ml-auto text-xs font-medium text-primary hover:underline"
                          >
                            {showAssignedNames[site.id] ? 'Hide names' : 'Show names'}
                          </button>
                        )}
                      </div>
                      {showAssignedNames[site.id] && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {site.assignedGuards.map((guard) => (
                            <span
                              key={guard.id}
                              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-xs"
                              title={`${guardLabel(guard)} — ${guard.onDuty ? 'on duty now' : 'off duty'}`}
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${guard.onDuty ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                              <span>{guard.name}</span>
                              {canManage && (
                                <button
                                  onClick={() => void unassignGuard(site, guard)}
                                  disabled={assignBusySiteId === site.id}
                                  title={`Remove ${guard.name} from ${site.name} and all its QR points`}
                                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          ))}
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
                            <div
                              key={sub.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => navigate(`/checkpoints/${sub.id}`)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  navigate(`/checkpoints/${sub.id}`)
                                }
                              }}
                              className={`cursor-pointer rounded-lg border p-4 transition-colors ${sub.active ? 'border-border hover:border-primary/60 hover:bg-accent/30' : 'border-muted opacity-50'}`}
                            >
                              <div className="flex items-start gap-3">
                                <QRCell data={qrData} />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">{sub.name}</div>
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
                                        · {formatTime(sub.lastScanAt)}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="mt-1 text-[11px] text-muted-foreground">Never scanned</div>
                                  )}
                                </div>
                              </div>
                              {/* The card navigates; the controls inside it
                                  must not, or picking a guard would bounce
                                  you onto the scan history mid-assignment. */}
                              <div onClick={(e) => e.stopPropagation()}>
                                {renderPointPostings(sub)}
                              </div>

                              <div onClick={(e) => e.stopPropagation()} className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                                <button
                                  onClick={() => void downloadQr(site, sub)}
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

                    {canManage && (
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-destructive/20 pt-4">
                        <div className="text-xs text-muted-foreground">
                          Deleting removes this location and its QR codes. Scans already taken here are kept.
                        </div>
                        <button
                          onClick={() => openDeleteSite(site)}
                          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete Location
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete Location confirmation */}
      {deleteSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">Delete {deleteSite.name}?</h2>
              <button
                onClick={() => setDeleteSite(null)}
                disabled={deletingSite}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {deleteImpactError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteImpactError}
              </div>
            ) : !deleteImpact ? (
              <div className="space-y-2">
                <CardSkeleton />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  This permanently removes the location from {detail.name}. It cannot be undone.
                </p>

                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-destructive">Removed</div>
                  <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                    <li>
                      {deleteImpact.qrCodes} QR code{deleteImpact.qrCodes === 1 ? '' : 's'}
                      {deleteImpact.subLocations > 0 && (
                        <> ({deleteImpact.subLocations} sub-location{deleteImpact.subLocations === 1 ? '' : 's'})</>
                      )}
                      {' '}— printed codes stop working
                    </li>
                    {deleteImpact.assignedGuards.length > 0 && (
                      <li>Postings for {deleteImpact.assignedGuards.join(', ')}</li>
                    )}
                    {deleteImpact.activePostOrders > 0 && (
                      <li>
                        {deleteImpact.activePostOrders} post order{deleteImpact.activePostOrders === 1 ? '' : 's'} deactivated
                      </li>
                    )}
                  </ul>
                </div>

                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kept</div>
                  <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                    <li>{deleteImpact.scans} scan{deleteImpact.scans === 1 ? '' : 's'} taken here</li>
                    <li>Reports and incidents filed at this location</li>
                  </ul>
                </div>

                {deleteImpact.assignedGuards.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {deleteImpact.assignedGuards.length} guard
                      {deleteImpact.assignedGuards.length === 1 ? ' is' : 's are'} posted here and will need reassigning.
                    </span>
                  </div>
                )}
              </div>
            )}

            {deleteSiteError && (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteSiteError}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeleteSite(null)}
                disabled={deletingSite}
                className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDeleteSite()}
                disabled={deletingSite || !deleteImpact}
                className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {deletingSite ? 'Deleting...' : 'Delete Location'}
              </button>
            </div>
          </div>
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
