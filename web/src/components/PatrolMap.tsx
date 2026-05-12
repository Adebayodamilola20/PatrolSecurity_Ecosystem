import { useEffect, useRef } from 'react'
import L from 'leaflet'

export function PatrolMap() {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    if (!ref.current.isConnected) return

    const map = L.map(ref.current, {
      center: [6.5248, 3.3795],
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    })
    mapRef.current = map

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const checkpoints = [
      { id: 'CP-01', name: 'Main Gate', lat: 6.5244, lng: 3.3792 },
      { id: 'CP-02', name: 'Warehouse A', lat: 6.5260, lng: 3.3820 },
      { id: 'CP-03', name: 'Perimeter East', lat: 6.5225, lng: 3.3835 },
      { id: 'CP-04', name: 'Loading Dock', lat: 6.5238, lng: 3.3760 },
      { id: 'CP-05', name: 'Staff Quarters', lat: 6.5275, lng: 3.3780 },
    ]

    checkpoints.forEach((cp) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:4px;background:oklch(0.62 0.20 265);box-shadow:0 0 0 3px rgba(99,102,241,0.25);border:2px solid white"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      L.marker([cp.lat, cp.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${cp.name}</b><br/>${cp.id}`)
    })

    const officers = [
      { id: 'OF-101', name: 'A. Bello', lat: 6.5250, lng: 3.3805, status: 'active' as const },
      { id: 'OF-102', name: 'K. Okafor', lat: 6.5232, lng: 3.3825, status: 'active' },
      { id: 'OF-103', name: 'S. Yusuf', lat: 6.5268, lng: 3.3775, status: 'alert' },
    ]

    officers.forEach((of) => {
      const color =
        of.status === 'alert'
          ? 'oklch(0.65 0.22 25)'
          : of.status === 'idle'
          ? 'oklch(0.78 0.16 75)'
          : 'oklch(0.70 0.16 150)'
      const icon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;width:28px;height:28px;">
            <div style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:0.25;animation:pulse 1.8s infinite"></div>
            <div style="position:absolute;inset:6px;border-radius:9999px;background:${color};border:2px solid white"></div>
          </div>
          <style>@keyframes pulse{0%{transform:scale(1);opacity:.4}100%{transform:scale(2);opacity:0}}</style>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      L.marker([of.lat, of.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${of.name}</b><br/>${of.id} — ${of.status}`)
    })

    L.polyline(
      [
        [6.5238, 3.3760],
        [6.5244, 3.3792],
        [6.5260, 3.3820],
        [6.5232, 3.3825],
        [6.5275, 3.3780],
      ],
      { color: 'oklch(0.62 0.20 265)', weight: 3, opacity: 0.7, dashArray: '6 6' }
    ).addTo(map)

    return () => {
      map.remove()
      const parent = ref.current?.parentNode
      if (parent && ref.current) {
        parent.appendChild(ref.current)
      }
      mapRef.current = null
    }
  }, [])

  return <div ref={ref} className="h-full w-full rounded-xl overflow-hidden" />
}
