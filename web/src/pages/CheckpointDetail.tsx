import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Search, QrCode, Clock, CheckCircle, XCircle, AlertTriangle, Timer, Download, Printer, ShieldCheck, CalendarDays } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import QRCodeLib from 'qrcode'
import L from 'leaflet'
import { api } from '../services/api'
import type { Scan } from '../types'
import { Skeleton } from '../components/ui/Skeleton'
import { formatDate, formatTime } from '../utils/format'
import { EmptyState } from '../components/ui/EmptyState'
import { getScheduleStatus } from '../utils/patrolSchedule'

interface PostedStaff {
  id: string; name: string; phone: string; role: string
  active: boolean; onDuty: boolean; assignedAt: string
}

interface CheckpointData {
  id: string; name: string; code: string
  latitude: number | null; longitude: number | null; radiusMeters: number | null
  siteName: string | null; siteLatitude: number | null; siteLongitude: number | null
  siteRadiusMeters: number | null; isPrimary?: boolean
  expectedIntervalMinutes: number; active: boolean; createdAt: string
  scheduledTimeIn?: string; scheduledTimeOut?: string
}

export default function CheckpointDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const qrRef = useRef<HTMLCanvasElement>(null)
  const [cp, setCp] = useState<CheckpointData | null>(null)
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'flagged'>('all')
  // "Was this gate patrolled last Tuesday" is the question staff actually ask
  // of a scan list, and verified/flagged alone could never answer it.
  const [datePreset, setDatePreset] = useState<'all' | 'today' | '7d' | '30d' | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [postedStaff, setPostedStaff] = useState<PostedStaff[]>([])

  // A sub-location is a plain QR point: no coordinates of its own. Its scans
  // verify against the parent location's geofence, so that is what we show.
  const hasOwnGps = cp?.latitude != null && cp?.longitude != null
  const geofence = hasOwnGps
    ? { lat: cp!.latitude!, lng: cp!.longitude!, radius: cp!.radiusMeters ?? 50, label: 'Checkpoint zone' }
    : cp?.siteLatitude != null && cp?.siteLongitude != null
      ? { lat: cp.siteLatitude, lng: cp.siteLongitude, radius: cp.siteRadiusMeters ?? 150, label: `${cp.siteName ?? 'Location'} geofence` }
      : null

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const [all, checkpointScans, staff] = await Promise.all([
        api.checkpoints.list(),
        api.scans.list({ checkpoint: id }),
        // Supervisors and admins can read this; anyone else still gets the
        // page, just without the posting list.
        api.checkpointAssignments.list(id).catch(() => [] as PostedStaff[]),
      ])
      const found = all.find((item: any) => item.id === id) || null
      if (!found) {
        throw new Error('Checkpoint details could not be found.')
      }
      setCp(found)
      setScans(checkpointScans)
      setPostedStaff(staff)
    } catch (err) {
      setCp(null)
      setScans([])
      setError(err instanceof Error ? err.message : 'Could not load checkpoint details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()

    const handleRetry = () => {
      void load()
    }

    window.addEventListener('app:retry', handleRetry)
    return () => window.removeEventListener('app:retry', handleRetry)
  }, [id])

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || !geofence) return
    const map = L.map(mapRef.current, { center: [geofence.lat, geofence.lng], zoom: 16, zoomControl: false })
    mapInstance.current = map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    const zone = L.circle([geofence.lat, geofence.lng], {
      color: 'oklch(0.62 0.20 265)', fillColor: 'oklch(0.62 0.20 265 / 0.15)', fillOpacity: 0.15, radius: geofence.radius, weight: 2,
    }).addTo(map)
    const cpIcon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;background:oklch(0.62 0.20 265);border:3px solid white;border-radius:4px;transform:rotate(45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9],
    })
    L.marker([geofence.lat, geofence.lng], { icon: cpIcon }).addTo(map)
    // Fit the whole geofence circle in view (a 5km radius won't fit zoom 16).
    map.fitBounds(zone.getBounds(), { padding: [16, 16] })
    return () => { map.remove(); mapInstance.current = null }
  }, [cp])

  useEffect(() => {
    if (qrRef.current && cp) {
      const qrUrl = `${window.location.origin}/checkpoints/${cp.id}`
      QRCodeLib.toCanvas(qrRef.current, qrUrl, {
        width: 132, margin: 1,
        color: { dark: '#111827', light: '#ffffff' },
      }).catch(() => {})
    }
  }, [cp])

  const downloadQr = async () => {
    if (!cp) return
    try {
      const url = await QRCodeLib.toDataURL(`${window.location.origin}/checkpoints/${cp.id}`, {
        width: 300, margin: 2, color: { dark: '#111827', light: '#ffffff' },
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `${cp.code}-qrcode.png`
      a.click()
    } catch { /* the on-screen QR is still available */ }
  }

  const printQr = () => {
    if (!cp) return
    const printWindow = window.open('', '_blank', 'width=480,height=640')
    if (!printWindow) return
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    printWindow.document.write(`
      <html>
        <head>
          <title>${esc(cp.code)} QR Code</title>
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
            <h1>${esc(cp.name)}</h1>
            <div class="site">${esc(cp.siteName ?? '')}</div>
            <div class="code">${esc(cp.code)}</div>
          </div>
        </body>
      </html>
    `)
    void QRCodeLib.toDataURL(`${window.location.origin}/checkpoints/${cp.id}`, { width: 600, margin: 2, color: { dark: '#111827', light: '#ffffff' } })
      .then((url) => {
        const image = printWindow.document.getElementById('qr-image') as HTMLImageElement | null
        if (image) image.src = url
        printWindow.document.close()
        printWindow.focus()
        printWindow.print()
      })
      .catch(() => printWindow.close())
  }

  // Presets cover the questions asked daily; the custom range is for the
  // "what happened on the 3rd" conversations that follow an incident. Both
  // ends are inclusive of the whole day — a range of 3rd–3rd must return the
  // 3rd, not nothing.
  const dateRange = (() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    switch (datePreset) {
      case 'today':
        return { from: startOfToday.getTime(), to: Infinity }
      case '7d':
        return { from: startOfToday.getTime() - 6 * 86400000, to: Infinity }
      case '30d':
        return { from: startOfToday.getTime() - 29 * 86400000, to: Infinity }
      case 'custom': {
        const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity
        const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity
        return { from, to }
      }
      default:
        return { from: -Infinity, to: Infinity }
    }
  })()

  const filteredScans = scans.filter(s => {
    const matchSearch = !search || s.officerName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || (statusFilter === 'verified' ? s.gpsValid : !s.gpsValid)
    const scannedAt = new Date(s.scannedAt).getTime()
    const matchDate = scannedAt >= dateRange.from && scannedAt <= dateRange.to
    return matchSearch && matchStatus && matchDate
  })
  const verifiedCount = scans.filter(s => s.gpsValid).length

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-8">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (!cp) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-7 w-7" />}
        title="Checkpoint details unavailable"
        description={error || 'There was a problem loading this checkpoint.'}
        action={
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8">
      <button onClick={() => navigate('/clients')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Clients
      </button>

      {/* Header: QR beside the details, everything in one compact card */}
      <div className={`rounded-xl border bg-card p-4 ${!cp.active ? 'opacity-40' : 'border-border'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <canvas ref={qrRef} className="shrink-0 self-center rounded-lg sm:self-start" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold">{cp.name}</h1>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{cp.code}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${cp.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                {cp.active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {hasOwnGps ? (
                <span className="text-muted-foreground">
                  Own GPS point: <span className="font-mono">{cp.latitude!.toFixed(6)}, {cp.longitude!.toFixed(6)}</span> · {cp.radiusMeters ?? 50}m zone
                </span>
              ) : cp.siteName ? (
                <span className="text-muted-foreground">
                  {cp.isPrimary ? 'Location QR of' : 'Patrol point inside'} <span className="font-medium text-foreground">{cp.siteName}</span>
                  {geofence ? <> — scans verify against its {geofence.radius}m geofence</> : <> — the location has no map point yet, so scans can't be GPS-verified</>}
                </span>
              ) : (
                <span className="text-warning">Not linked to a location — scans can't be GPS-verified.</span>
              )}
            </div>

            {/* Inline facts instead of four half-empty stat boxes */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5 text-info" /> {scans.length} scan{scans.length === 1 ? '' : 's'}</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-success" /> {verifiedCount} verified</span>
              <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-primary" /> every {cp.expectedIntervalMinutes} min</span>
              {cp.scheduledTimeIn ? (
                <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-warning" /> {cp.scheduledTimeIn}{cp.scheduledTimeOut ? ` – ${cp.scheduledTimeOut}` : ''}</span>
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => void downloadQr()}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                <Download className="h-3.5 w-3.5" /> QR
              </button>
              <button onClick={printQr}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Geofence map — only when there are real coordinates to show */}
      {geofence && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="p-2">
            <div ref={mapRef} className="h-44 rounded-lg" />
          </div>
          <div className="flex items-center gap-4 px-4 pb-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 bg-primary" style={{ borderRadius: '2px', transform: 'rotate(45deg)' }} />
              {hasOwnGps ? 'Checkpoint' : cp.siteName ?? 'Location'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary" />
              {geofence.label} ({geofence.radius}m)
            </span>
          </div>
        </div>
      )}

      {/* Who is supposed to be producing these scans. Without it an empty
          list below is ambiguous: nobody patrolled, or nobody was posted. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Assigned guards</h3>
        {postedStaff.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody is assigned to this point yet. Assign guards from the client's location page.
          </p>
        ) : (
          <div className="space-y-2">
            {postedStaff.map((person) => (
              <div key={person.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/30 px-3 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${person.onDuty ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                <span className="text-sm font-medium">{person.name}</span>
                <span className="text-xs capitalize text-muted-foreground">{person.role}</span>
                <span className="text-xs text-muted-foreground">{person.phone}</span>
                <span className={`ml-auto text-xs ${person.onDuty ? 'text-success' : 'text-muted-foreground'}`}>
                  {person.onDuty ? 'On duty now' : 'Off duty'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="mb-3 font-semibold">Scans</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search officer..."
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="flex gap-1 self-start rounded-lg border border-border p-1">
              {(['all', 'verified', 'flagged'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Date
            </span>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
              {([
                ['all', 'All time'],
                ['today', 'Today'],
                ['7d', 'Last 7 days'],
                ['30d', 'Last 30 days'],
                ['custom', 'Pick dates'],
              ] as const).map(([value, label]) => (
                <button key={value} onClick={() => setDatePreset(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${datePreset === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {datePreset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">From</span>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">To</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="divide-y divide-border">
          {filteredScans.map((scan) => {
            const arrivalStatus = getScheduleStatus(scan.scannedAt, cp.scheduledTimeIn, { mode: 'arrival' })
            const overtimeStatus = getScheduleStatus(scan.scannedAt, cp.scheduledTimeOut, { mode: 'departure' })
            const isLate = arrivalStatus.kind === 'late' || overtimeStatus.kind === 'late'
            return (
              <button key={scan.id} onClick={() => navigate(`/scans/${scan.id}`)}
                className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/30 ${isLate ? 'bg-destructive/5' : ''}`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${scan.gpsValid ? 'bg-success/15' : 'bg-destructive/15'}`}>
                  {scan.gpsValid ? <CheckCircle className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{scan.officerName}</div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(scan.scannedAt)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{scan.notes || 'No notes'}</div>
                  <div className="mt-2 flex items-center gap-3 text-[11px]">
                    <span className="text-muted-foreground">{formatTime(scan.scannedAt)}</span>
                    <span className={scan.gpsValid ? 'text-success' : 'text-destructive'}>
                      {scan.gpsValid ? `${scan.distanceMeters}m` : 'GPS Flagged'}
                    </span>
                    {arrivalStatus.kind !== 'unscheduled' && (
                      <span className={`flex items-center gap-1 font-semibold ${
                        arrivalStatus.kind === 'late'
                          ? 'text-destructive'
                          : arrivalStatus.kind === 'early'
                            ? 'text-info'
                            : 'text-success'
                      }`}>
                        {arrivalStatus.kind === 'late' && <AlertTriangle className="h-3 w-3" />}
                        {arrivalStatus.label}
                      </span>
                    )}
                    {overtimeStatus.kind === 'late' && (
                      <span className="flex items-center gap-1 font-semibold text-warning">
                        <Clock className="h-3 w-3" />
                        Past clock-out by {overtimeStatus.absMinutes} min
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
          {filteredScans.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {scans.length === 0 ? 'No scans yet at this checkpoint.' : 'No scans match your filters.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
