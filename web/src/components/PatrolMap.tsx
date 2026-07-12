import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { loadGoogleMaps } from '../services/googleMaps'
import {
  subscribeToIncidents,
  subscribeToScans,
  subscribeToShiftUpdates,
  subscribeToPositionUpdates,
} from '../services/websocket'
import type { Checkpoint, Scan, User } from '../types'

interface LiveOfficer {
  id: string
  name: string
  onDuty: boolean
  lat: number | null
  lng: number | null
  lastSeenAt?: string | null
  checkpointName?: string | null
}

interface LiveIncident {
  id: string
  title: string
  severity: string
  officerName?: string
  description?: string
  checkpointName?: string
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function PatrolMap() {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const checkpointMarkersRef = useRef<any[]>([])
  const officerMarkersRef = useRef<Map<string, any>>(new Map())
  const scanMarkersRef = useRef<any[]>([])
  const liveOfficersRef = useRef<Map<string, LiveOfficer>>(new Map())
  const [summary, setSummary] = useState({
    activeOfficers: 0,
    checkpoints: 0,
    recentScans: 0,
  })
  const [latestIncident, setLatestIncident] = useState<LiveIncident | null>(null)
  const [mapError, setMapError] = useState('')

  useEffect(() => {
    if (!ref.current || mapRef.current || !ref.current.isConnected) return

    let disposed = false

    const clearMarkers = (markers: any[]) => {
      markers.forEach((marker) => marker.setMap(null))
      markers.length = 0
    }

    const renderMapData = (maps: any, checkpoints: Checkpoint[], users: User[], scans: Scan[]) => {
      const map = mapRef.current
      if (!map) return

      clearMarkers(checkpointMarkersRef.current)
      clearMarkers(scanMarkersRef.current)

      const bounds = new maps.LatLngBounds()

      checkpoints.forEach((checkpoint) => {
        // Sub-locations have no coordinates of their own, so they can't be
        // placed on the map — skip them instead of feeding Google Maps a null
        // position (which throws "not a LatLng").
        if (checkpoint.latitude == null || checkpoint.longitude == null) return
        const marker = new maps.Marker({
          map,
          position: { lat: checkpoint.latitude, lng: checkpoint.longitude },
          title: checkpoint.name,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4f7cff',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        })
        marker.addListener('click', () => {
          new maps.InfoWindow({
            content: `<div style="min-width:160px"><strong>${escapeHtml(checkpoint.name)}</strong><br/>${escapeHtml(checkpoint.code)}<br/>Radius: ${checkpoint.radiusMeters ?? 50}m</div>`,
          }).open({ map, anchor: marker })
        })
        checkpointMarkersRef.current.push(marker)
        bounds.extend(marker.getPosition())
      })

      const activeOfficerIds = new Set(
        users
          .filter((user) => user.role === 'guard' && user.onDuty)
          .map((user) => user.id),
      )

      const latestByOfficer = new Map<string, Scan>()
      scans.forEach((scan) => {
        if (scan.gpsLatitude == null || scan.gpsLongitude == null || latestByOfficer.has(scan.officerId)) return
        latestByOfficer.set(scan.officerId, scan)
      })

      users.filter((user) => user.role === 'guard' && user.onDuty).forEach((user) => {
        const lastScan = latestByOfficer.get(user.id)
        const existing = liveOfficersRef.current.get(user.id)
        if (!existing) {
          liveOfficersRef.current.set(user.id, {
            id: user.id,
            name: user.name,
            onDuty: true,
            lat: lastScan?.gpsLatitude ?? null,
            lng: lastScan?.gpsLongitude ?? null,
            lastSeenAt: lastScan?.scannedAt ?? user.lastClockIn ?? null,
            checkpointName: lastScan?.checkpointName ?? null,
          })
        } else {
          existing.onDuty = true
          existing.name = user.name
          if (!existing.lat && lastScan?.gpsLatitude) {
            existing.lat = lastScan.gpsLatitude
            existing.lng = lastScan.gpsLongitude
          }
        }
      })

      liveOfficersRef.current.forEach((officer, id) => {
        if (!activeOfficerIds.has(id) && officer.lat == null) {
          liveOfficersRef.current.delete(id)
          const marker = officerMarkersRef.current.get(id)
          if (marker) {
            marker.setMap(null)
            officerMarkersRef.current.delete(id)
          }
          return
        }

        let marker = officerMarkersRef.current.get(id)
        if (!marker) {
          if (officer.lat == null || officer.lng == null) return
          marker = new maps.Marker({
            map,
            position: { lat: officer.lat, lng: officer.lng },
            title: officer.name,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#14b86a',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3,
            },
          })
          marker.addListener('click', () => {
            const officerName = escapeHtml(officer.name)
            const checkpointName = officer.checkpointName ? escapeHtml(officer.checkpointName) : ''
            const lastSeen = officer.lastSeenAt ? escapeHtml(new Date(officer.lastSeenAt).toLocaleString()) : 'Unknown'
            new maps.InfoWindow({
              content: `<div style="min-width:220px;padding:4px 2px;color:#0f172a;font-family:Arial,sans-serif">
                <div style="font-size:16px;font-weight:700;color:#0f172a">${officerName}</div>
                <div style="margin-top:4px;font-size:12px;font-weight:600;color:#047857">On duty</div>
                ${checkpointName ? `<div style="margin-top:8px;font-size:13px;color:#334155"><strong style="color:#0f172a">Last checkpoint:</strong> ${checkpointName}</div>` : ''}
                <div style="margin-top:6px;font-size:13px;color:#334155"><strong style="color:#0f172a">Last seen:</strong> ${lastSeen}</div>
              </div>`,
            }).open({ map, anchor: marker })
          })
          officerMarkersRef.current.set(id, marker)
          bounds.extend(marker.getPosition())
        }
      })

      scans
        .filter((scan) => activeOfficerIds.has(scan.officerId))
        .slice(0, 30)
        .forEach((scan) => {
          if (scan.gpsLatitude == null || scan.gpsLongitude == null) return
          const marker = new maps.Marker({
            map,
            position: { lat: scan.gpsLatitude, lng: scan.gpsLongitude },
            title: `${scan.officerName} at ${scan.checkpointName}`,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: scan.gpsValid ? '#fbbf24' : '#ef4444',
              fillOpacity: 0.95,
              strokeColor: '#0b1220',
              strokeWeight: 2,
            },
          })
          scanMarkersRef.current.push(marker)
        })

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 80)
      }

      setSummary({
        activeOfficers: liveOfficersRef.current.size,
        checkpoints: checkpoints.length,
        recentScans: scans.length,
      })
    }

    const init = async () => {
      try {
        const maps = await loadGoogleMaps()
        if (disposed || !ref.current) return

        const map = new maps.Map(ref.current, {
          center: { lat: 6.5244, lng: 3.3792 },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#111827' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
          ],
        })
        mapRef.current = map

        const fetchAll = async () => {
          const [checkpoints, users, scans] = await Promise.all([
            api.checkpoints.list(),
            api.users.list(),
            api.scans.recent(),
          ])
          renderMapData(maps, checkpoints, users, scans)
        }

        await fetchAll()

        const unsubScans = subscribeToScans(async () => {
          await fetchAll()
        })
        const unsubShifts = subscribeToShiftUpdates(async () => {
          await fetchAll()
        })
        const unsubIncidents = subscribeToIncidents((incident: any) => {
          setLatestIncident({
            id: incident.id,
            title: incident.title,
            severity: incident.severity,
            officerName: incident.officerName,
            description: incident.description,
            checkpointName: incident.checkpointName,
          })
        })
        const unsubPositions = subscribeToPositionUpdates((data: any) => {
          const map = mapRef.current
          if (!map || !maps) return

          const existing = liveOfficersRef.current.get(data.userId)
          if (existing) {
            existing.lat = data.latitude
            existing.lng = data.longitude
            existing.lastSeenAt = data.capturedAt
          } else {
            liveOfficersRef.current.set(data.userId, {
              id: data.userId,
              name: data.name || 'Unknown',
              onDuty: true,
              lat: data.latitude,
              lng: data.longitude,
              lastSeenAt: data.capturedAt,
            })
          }

          let marker = officerMarkersRef.current.get(data.userId)
          if (marker) {
            marker.setPosition({ lat: data.latitude, lng: data.longitude })
          } else {
            marker = new maps.Marker({
              map,
              position: { lat: data.latitude, lng: data.longitude },
              title: data.name || 'Officer',
              icon: {
                path: maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#14b86a',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              },
            })
            marker.addListener('click', () => {
              const name = escapeHtml(data.name || 'Officer')
              new maps.InfoWindow({
                content: `<div style="min-width:220px;padding:4px 2px;color:#0f172a;font-family:Arial,sans-serif">
                  <div style="font-size:16px;font-weight:700;color:#0f172a">${name}</div>
                  <div style="margin-top:4px;font-size:12px;font-weight:600;color:#047857">On duty</div>
                  <div style="margin-top:6px;font-size:13px;color:#334155"><strong style="color:#0f172a">Live</strong> — receiving position updates</div>
                </div>`,
              }).open({ map, anchor: marker })
            })
            officerMarkersRef.current.set(data.userId, marker)
          }
          setSummary((prev) => ({ ...prev, activeOfficers: liveOfficersRef.current.size }))
        })

        const poll = window.setInterval(fetchAll, 30000)

        ;(mapRef.current as any).__cleanup = () => {
          unsubScans()
          unsubShifts()
          unsubIncidents()
          unsubPositions()
          window.clearInterval(poll)
        }
      } catch (error) {
        setMapError(
          error instanceof Error
            ? error.message
            : 'Could not load live monitoring map.',
        )
      }
    }

    void init()

    return () => {
      disposed = true
      if (mapRef.current?.__cleanup) {
        mapRef.current.__cleanup()
      }
      clearMarkers(checkpointMarkersRef.current)
      clearMarkers(scanMarkersRef.current)
      officerMarkersRef.current.forEach((marker) => marker.setMap(null))
      officerMarkersRef.current.clear()
      liveOfficersRef.current.clear()
      mapRef.current = null
    }
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <div ref={ref} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 flex gap-2">
        <div className="rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-xs text-white backdrop-blur">
          <div className="text-[10px] uppercase tracking-wide text-white/60">Live officers</div>
          <div className="mt-1 text-lg font-semibold">{summary.activeOfficers}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-xs text-white backdrop-blur">
          <div className="text-[10px] uppercase tracking-wide text-white/60">Checkpoints</div>
          <div className="mt-1 text-lg font-semibold">{summary.checkpoints}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-xs text-white backdrop-blur">
          <div className="text-[10px] uppercase tracking-wide text-white/60">Recent scans</div>
          <div className="mt-1 text-lg font-semibold">{summary.recentScans}</div>
        </div>
      </div>
      {latestIncident ? (
        <div className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-white backdrop-blur">
          <div className="text-[10px] uppercase tracking-wide text-red-200">Latest incident</div>
          <div className="mt-1 font-medium">{latestIncident.title}</div>
          <div className="text-xs text-red-100/80">
            {latestIncident.severity}
            {latestIncident.officerName ? ` · ${latestIncident.officerName}` : ''}
            {latestIncident.checkpointName ? ` · ${latestIncident.checkpointName}` : ''}
          </div>
          {latestIncident.description ? (
            <div className="mt-1 text-xs text-red-100/70">{latestIncident.description}</div>
          ) : null}
        </div>
      ) : null}
      {mapError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-sm text-muted-foreground">
          {mapError}
        </div>
      ) : null}
    </div>
  )
}
