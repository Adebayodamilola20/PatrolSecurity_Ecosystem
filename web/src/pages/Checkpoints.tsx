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
  inactive: 'bg-destructive/15 text-destructive',
}

interface AddressSuggestion {
  display_name: string
  lat: string
  lon: string
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
  const [form, setForm] = useState({ name: '', code: '', latitude: '', longitude: '', radiusMeters: '50', expectedIntervalMinutes: '30' })
  const [addressQuery, setAddressQuery] = useState('')
  const [addressResults, setAddressResults] = useState<AddressSuggestion[]>([])
  const [searchingAddress, setSearchingAddress] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.checkpoints.list().then(setCheckpoints).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!showModal) return
    if (addressQuery.trim().length < 3) {
      setAddressResults([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setSearchingAddress(true)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ng&limit=5&q=${encodeURIComponent(addressQuery)}`,
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }
        )
        const data = await res.json()
        setAddressResults(Array.isArray(data) ? data : [])
      } catch {
        setAddressResults([])
      } finally {
        setSearchingAddress(false)
      }
    }, 400)

    return () => {
      controller.abort()
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
      })
      setShowModal(false)
      setForm({ name: '', code: '', latitude: '', longitude: '', radiusMeters: '50', expectedIntervalMinutes: '30' })
      setAddressQuery('')
      setAddressResults([])
      const list = await api.checkpoints.list()
      setCheckpoints(list)
    } catch {}
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
                    <div className="px-3 py-2 text-xs text-muted-foreground">Searching address...</div>
                  ) : addressResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No address selected yet.</div>
                  ) : (
                    addressResults.map((result) => (
                      <button
                        key={`${result.lat}-${result.lon}`}
                        type="button"
                        onClick={() => {
                          const label = result.display_name.split(',')[0]?.trim() || result.display_name
                          setForm(f => ({
                            ...f,
                            name: f.name || label,
                            latitude: result.lat,
                            longitude: result.lon,
                          }))
                          setAddressQuery(result.display_name)
                          setAddressResults([])
                        }}
                        className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                      >
                        {result.display_name}
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
