import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  User,
  Clock,
  CheckCircle,
  XCircle,
  Camera,
  Navigation,
  FileText,
  Ruler,
} from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import L from 'leaflet'
import { api } from '../services/api'
import type { Scan } from '../types'
import { Skeleton } from '../components/ui/Skeleton'

export default function ScanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const [scan, setScan] = useState<Scan | null>(null)

  useEffect(() => {
    if (!id) return
    api.scans.get(id).then(setScan).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || !scan) return
    if (scan.gpsLatitude == null || scan.gpsLongitude == null) return
    const map = L.map(mapRef.current, {
      center: [scan.gpsLatitude, scan.gpsLongitude],
      zoom: 16,
      zoomControl: false,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const scanIcon = L.divIcon({
      className: '',
      html: '<div style="width:20px;height:20px;background:oklch(0.62 0.20 265);border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })
    L.marker([scan.gpsLatitude, scan.gpsLongitude], { icon: scanIcon }).addTo(map)

    map.setView([scan.gpsLatitude, scan.gpsLongitude], 16)

    return () => { map.remove(); mapInstance.current = null }
  }, [scan])

  if (!scan) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[300px] w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to patrol history
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-foreground">Scan Details</h1>
                <p className="text-xs text-muted-foreground">ID: {id}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
                scan.gpsValid ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
              }`}>
                {scan.gpsValid ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {scan.gpsValid ? 'GPS Verified' : 'GPS Mismatch'}
              </span>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/15 text-primary">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Officer</p>
                    <p className="text-sm font-medium text-foreground">{scan.officerName}</p>
                    <p className="text-xs text-muted-foreground">{scan.officerPhone || 'No phone'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/15 text-primary">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Checkpoint</p>
                    <p className="text-sm font-medium text-foreground">{scan.checkpointName}</p>
                    <p className="text-xs text-muted-foreground">{scan.checkpointCode}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/15 text-primary">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scanned At</p>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(scan.scannedAt).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(scan.scannedAt).toLocaleTimeString()}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/15 text-primary">
                    <Ruler className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Distance from Checkpoint</p>
                    <p className="text-sm font-medium text-foreground">{scan.distanceMeters} meters</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {scan.notes && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Patrol Notes</h3>
              </div>
              <p className="text-sm text-muted-foreground">{scan.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Location Map</h3>
            </div>
            <div ref={mapRef} className="h-[300px]" />
            <div className="p-4 space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary shrink-0" />
                Scan Location ({scan.gpsLatitude?.toFixed(4) ?? 'N/A'}, {scan.gpsLongitude?.toFixed(4) ?? 'N/A'})
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${scan.gpsValid ? 'bg-success' : 'bg-destructive'} shrink-0`} />
                {scan.gpsValid ? 'GPS within valid range' : 'GPS outside valid range'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold text-foreground mb-3">Timeline</h3>
            <div className="space-y-4">
              {[
                { label: 'QR Scanned', time: scan.scannedAt, icon: Camera },
                { label: 'GPS Validated', time: scan.receivedAt, icon: Navigation },
                { label: 'Reported to Server', time: scan.receivedAt, icon: Clock },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-primary/15 text-primary">
                    <item.icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{new Date(item.time).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
