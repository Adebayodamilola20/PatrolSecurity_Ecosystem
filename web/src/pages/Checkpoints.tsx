import { useEffect, useState, useRef } from 'react'
import { X, MapPin, ScanLine, Download, Edit, Trash2, MapIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { api } from '../services/api'
import type { Checkpoint } from '../types'
import { CardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

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
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', latitude: '', longitude: '', radiusMeters: '50', expectedIntervalMinutes: '30', scheduledTimeIn: '', scheduledTimeOut: '' })
  const [addressQuery, setAddressQuery] = useState('')
  const [addressResults, setAddressResults] = useState<AddressSuggestion[]>([])
  const [searchingAddress, setSearchingAddress] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [resolvingCurrentLocation, setResolvingCurrentLocation] = useState(false)
  const [locationInfo, setLocationInfo] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    setLoading(true)
    api.checkpoints.list().then(setCheckpoints).finally(() => setLoading(false))
  }, [])

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

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete checkpoint "${name}"?\n\nNote: Checkpoints with linked incidents, scans, or shifts cannot be deleted. Try deactivating instead.`)) return
    try {
      setActionError('')
      await api.checkpoints.delete(id)
      setCheckpoints(prev => prev.filter(c => c.id !== id))
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      setActionError(
        msg || 'Cannot delete — this checkpoint has linked records. Deactivate it instead (set "active" to false).',
      )
    }
  }

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setAddressError('This browser does not support location access.')
      return
    }

    try {
      setResolvingCurrentLocation(true)
      setAddressError('')
      setLocationInfo('')
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      })

      const latitude = String(position.coords.latitude)
      const longitude = String(position.coords.longitude)
      const accuracy = Math.max(25, Math.ceil(position.coords.accuracy || 0))
      const suggestedRadius = Math.max(
        Number(form.radiusMeters) || 50,
        Math.ceil((accuracy + 25) / 25) * 25,
      )

      setForm((f) => ({
        ...f,
        latitude,
        longitude,
        radiusMeters: String(suggestedRadius),
      }))
      setLocationInfo(`Current location captured. GPS accuracy is about ${accuracy}m, so checkpoint radius was adjusted to ${suggestedRadius}m.`)

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        )

        if (response.ok) {
          const result = await response.json()
          const displayName = String(result.display_name || '').trim()
          const suggestedName =
            String(result.name || result.address?.road || result.address?.suburb || result.address?.neighbourhood || '')
              .trim()

          setAddressQuery(displayName || `${latitude}, ${longitude}`)
          setForm((f) => ({
            ...f,
            name: f.name || suggestedName,
          }))
        } else {
          setAddressQuery(`${latitude}, ${longitude}`)
        }
      } catch {
        setAddressQuery(`${latitude}, ${longitude}`)
      }

      setAddressResults([])
    } catch {
      setAddressError('Could not get your current location. Check browser permission and try again.')
    } finally {
      setResolvingCurrentLocation(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
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
      setForm({ name: '', code: '', latitude: '', longitude: '', radiusMeters: '50', expectedIntervalMinutes: '30', scheduledTimeIn: '', scheduledTimeOut: '' })
      setAddressQuery('')
      setAddressResults([])
      setAddressError('')
      const list = await api.checkpoints.list()
      setCheckpoints(list)
    } catch {}
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
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <ScanLine className="h-4 w-4" /> Add Checkpoint
        </button>
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
          action={
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <ScanLine className="h-4 w-4" /> Add Checkpoint
            </button>
          }
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
                    {cp.latitude.toFixed(4)}, {cp.longitude.toFixed(4)}
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
                    onClick={() => navigate(`/checkpoints/${cp.id}`)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/15 text-primary px-2.5 py-1.5 text-xs font-medium hover:bg-primary/25"
                  >
                    Details
                  </button>
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
                  <button
                    onClick={() => handleDelete(cp.id, cp.name)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">New Checkpoint</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-muted-foreground">Find location</label>
                  <button
                    type="button"
                    onClick={() => void handleUseCurrentLocation()}
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
                  Search uses OpenStreetMap. You can also enter coordinates directly, for example `6.5244, 3.3792`.
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
                  <label className="text-xs text-muted-foreground">Expected Interval (min)</label>
                  <input type="number" value={form.expectedIntervalMinutes} onChange={e => setForm(f => ({ ...f, expectedIntervalMinutes: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
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
              <button type="submit" className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                Create Checkpoint
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
