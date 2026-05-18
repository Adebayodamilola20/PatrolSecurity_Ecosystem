import { useEffect, useState, useRef } from 'react'
import { X, MapPin, ScanLine, Download, Edit, Trash2, MapIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { api } from '../services/api'
import { loadGoogleMaps } from '../services/googleMaps'
import type { Checkpoint } from '../types'
import { CardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

const statusColor: Record<string, string> = {
  active: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  inactive: 'bg-destructive/15 text-destructive',
}

interface AddressSuggestion {
  placeId: string
  mainText: string
  secondaryText: string
  description: string
}

function getStatus(cp: Checkpoint): string {
  if (!cp.active) return 'inactive'
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
        const maps = await loadGoogleMaps()
        const service = new maps.places.AutocompleteService()
        const sessionToken = new maps.places.AutocompleteSessionToken()

        const response = await service.getPlacePredictions({
          input: addressQuery,
          componentRestrictions: { country: 'ng' },
          types: ['geocode', 'establishment'],
          sessionToken,
        })

        if (!active) return

        if (response?.status === 'REQUEST_DENIED') {
          setAddressResults([])
          setAddressError('Places API is not enabled. Go to https://console.cloud.google.com/apis/library/places-backend.googleapis.com and enable "Places API", then ensure billing is set up.')
          setSearchingAddress(false)
          return
        }

        const predictions = Array.isArray(response?.predictions)
          ? response.predictions
          : Array.isArray(response)
              ? response
              : []

        setAddressResults(
          predictions.map((prediction: any) => ({
            placeId: prediction.place_id,
            mainText:
              prediction.structured_formatting?.main_text ||
              prediction.description,
            secondaryText:
              prediction.structured_formatting?.secondary_text || '',
            description: prediction.description,
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

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete checkpoint "${name}"?`)) return
    try {
      await api.checkpoints.delete(id)
      setCheckpoints(prev => prev.filter(c => c.id !== id))
    } catch {}
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

  const handleAddressSelect = async (result: AddressSuggestion) => {
    try {
      const maps = await loadGoogleMaps()
      const service = new maps.places.PlacesService(document.createElement('div'))

      const details = await new Promise<any>((resolve, reject) => {
        service.getDetails(
          {
            placeId: result.placeId,
            fields: ['name', 'formatted_address', 'geometry', 'place_id'],
          },
          (place: any, status: any) => {
            if (status !== maps.places.PlacesServiceStatus.OK || !place) {
              if (status === 'REQUEST_DENIED') {
                reject(new Error('Places API is not enabled. Enable it at https://console.cloud.google.com/apis/library/places-backend.googleapis.com'))
              } else {
                reject(new Error('Could not load the selected place details.'))
              }
              return
            }
            resolve(place)
          },
        )
      })

      const lat = details.geometry?.location?.lat?.()
      const lng = details.geometry?.location?.lng?.()

      setForm((f) => ({
        ...f,
        name: f.name || details.name || result.mainText,
        latitude: lat != null ? String(lat) : f.latitude,
        longitude: lng != null ? String(lng) : f.longitude,
      }))
      setAddressQuery(details.formatted_address || result.description)
      setAddressResults([])
      setAddressError('')
    } catch (error) {
      setAddressError(
        error instanceof Error
          ? error.message
          : 'Could not use the selected place.',
      )
    }
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
            return (
              <div key={cp.id} className="rounded-xl border border-border bg-card p-5">
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
                      {status}
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
                      const dlUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#ffffff', light: '#111827' } })
                      const a = document.createElement('a')
                      a.href = dlUrl
                      a.download = `${cp.code}-qrcode.png`
                      a.click()
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
                <label className="text-xs text-muted-foreground">Search Address in Nigeria</label>
                <input
                  value={addressQuery}
                  onChange={e => setAddressQuery(e.target.value)}
                  placeholder="Start typing a real address, estate, gate, or landmark"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="mt-2 rounded-lg border border-border bg-background">
                  {searchingAddress ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Searching places...</div>
                  ) : addressError ? (
                    <div className="px-3 py-2 text-xs text-destructive">{addressError}</div>
                  ) : addressResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No address selected yet.</div>
                  ) : (
                    addressResults.map((result) => (
                      <button
                        key={result.placeId}
                        type="button"
                        onClick={() => handleAddressSelect(result)}
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
