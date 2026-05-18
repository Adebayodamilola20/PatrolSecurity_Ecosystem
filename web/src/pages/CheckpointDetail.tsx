import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Search, QrCode, Clock, CheckCircle, XCircle, Ruler, AlertTriangle, Timer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import QRCodeLib from 'qrcode'
import L from 'leaflet'
import { api } from '../services/api'
import type { Scan } from '../types'
import { Skeleton } from '../components/ui/Skeleton'
import { formatDate } from '../utils/format'

interface CheckpointData {
  id: string; name: string; code: string; latitude: number; longitude: number
  radiusMeters: number; expectedIntervalMinutes: number; active: boolean; createdAt: string
  scheduledTimeIn?: string; scheduledTimeOut?: string
}

function safeNumber(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default function CheckpointDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const qrRef = useRef<HTMLCanvasElement>(null)
  const [cp, setCp] = useState<CheckpointData | null>(null)
  const [scans, setScans] = useState<Scan[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'flagged'>('all')
  const safeRadius = safeNumber(cp?.radiusMeters, 50)
  const safeLatitude = safeNumber(cp?.latitude, 0)
  const safeLongitude = safeNumber(cp?.longitude, 0)

  useEffect(() => {
    if (!id) return
    api.checkpoints.list().then((all: any[]) => {
      const found = all.find((c: any) => c.id === id)
      if (found) setCp(found)
    }).catch(() => {})
    api.scans.list({ checkpoint: id }).then(setScans).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || !cp) return
    const map = L.map(mapRef.current, { center: [safeLatitude, safeLongitude], zoom: 17, zoomControl: false })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.circle([safeLatitude, safeLongitude], {
      color: 'oklch(0.62 0.20 265)', fillColor: 'oklch(0.62 0.20 265 / 0.15)', fillOpacity: 0.15, radius: safeRadius, weight: 2,
    }).addTo(map)
    const cpIcon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;background:oklch(0.62 0.20 265);border:3px solid white;border-radius:4px;transform:rotate(45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9],
    })
    L.marker([safeLatitude, safeLongitude], { icon: cpIcon }).addTo(map)
    return () => { map.remove(); mapInstance.current = null }
  }, [cp, safeLatitude, safeLongitude, safeRadius])

  useEffect(() => {
    if (qrRef.current && cp) {
      const qrUrl = `${window.location.origin}/checkpoints/${cp.id}`
      QRCodeLib.toCanvas(qrRef.current, qrUrl, {
        width: 180, margin: 2,
        color: { dark: '#ffffff', light: '#111827' },
      }).catch(() => {})
    }
  }, [cp])

  const filteredScans = scans.filter(s => {
    const matchSearch = !search || s.officerName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || (statusFilter === 'verified' ? s.gpsValid : !s.gpsValid)
    return matchSearch && matchStatus
  })

  if (!cp) {
    return (
      <div className="pb-8 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="pb-8 space-y-4">
      <button onClick={() => navigate('/checkpoints')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Checkpoints
      </button>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="relative h-44 bg-gradient-to-br from-primary/20 via-info/10 to-background flex items-center justify-center">
          <canvas ref={qrRef} className="rounded-lg" />
        </div>
        <div className="p-4 -mt-8 relative">
          <div className="rounded-xl bg-card border border-border p-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold">{cp.name}</h1>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{cp.code}</p>
              </div>
              <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase ${cp.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                {cp.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              {safeLatitude.toFixed(6)}, {safeLongitude.toFixed(6)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Scans', value: scans.length, icon: QrCode, color: 'text-info' },
          { label: 'Radius', value: `${safeRadius}m`, icon: Ruler, color: 'text-warning' },
          { label: 'Scheduled In', value: cp.scheduledTimeIn || '—', icon: Timer, color: 'text-primary' },
          { label: 'Scheduled Out', value: cp.scheduledTimeOut || '—', icon: Clock, color: 'text-success' },
        ].map((item, i) => {
          const Icon = item.icon
          return (
            <div key={i} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${item.color}`} />
                <span className="text-[11px] text-muted-foreground">{item.label}</span>
              </div>
              <div className="mt-1.5 text-lg font-bold">{item.value}</div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-2">
          <div ref={mapRef} className="h-48 rounded-lg" />
        </div>
        <div className="px-4 pb-3 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-primary shrink-0" style={{ borderRadius: '2px', transform: 'rotate(45deg)' }} />
            Location
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-primary shrink-0" />
            {safeRadius}m Zone
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold mb-3">Scans</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search officer..."
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-1 rounded-lg border border-border p-1 self-start">
              {(['all', 'verified', 'flagged'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="divide-y divide-border">
          {filteredScans.map((scan) => {
            const scanTime = new Date(scan.scannedAt)
            let lateMins = 0
            if (cp.scheduledTimeIn) {
              const [sh, sm] = cp.scheduledTimeIn.split(':').map(Number)
              const sched = new Date(scanTime)
              sched.setHours(sh, sm, 0, 0)
              lateMins = Math.round((scanTime.getTime() - sched.getTime()) / 60000)
            }
            const isLate = lateMins > 0
            return (
              <button key={scan.id} onClick={() => navigate(`/scans/${scan.id}`)}
                className={`w-full p-4 flex items-start gap-3 hover:bg-accent/30 transition-colors text-left ${isLate ? 'bg-destructive/5' : ''}`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${scan.gpsValid ? 'bg-success/15' : 'bg-destructive/15'}`}>
                  {scan.gpsValid ? <CheckCircle className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{scan.officerName}</div>
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(scan.scannedAt)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{scan.notes || 'No notes'}</div>
                  <div className="flex items-center gap-3 mt-2 text-[11px]">
                    <span className="text-muted-foreground">{new Date(scan.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={scan.gpsValid ? 'text-success' : 'text-destructive'}>
                      {scan.gpsValid ? `${scan.distanceMeters}m` : 'GPS Flagged'}
                    </span>
                    {isLate && (
                      <span className="flex items-center gap-1 text-destructive font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        {lateMins}min late
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
          {filteredScans.length === 0 && (
            <div className="p-8 text-sm text-muted-foreground text-center">
              {scans.length === 0 ? 'No scans yet at this checkpoint.' : 'No scans match your filters.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
