import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate } from '../utils/format'
import { api } from '../services/api'
import { loadGoogleMaps } from '../services/googleMaps'
import {
  subscribeToIncidents,
  subscribeToScans,
  subscribeToShiftUpdates,
  subscribeToPositionUpdates,
} from '../services/websocket'
import type { Checkpoint, Scan, User } from '../types'

type OfficerStatus = 'responding' | 'patrol' | 'onduty'

interface LiveOfficer {
  id: string
  name: string
  onDuty: boolean
  lat: number | null
  lng: number | null
  lastSeenAt?: string | null
  checkpointName?: string | null
  siteName?: string | null
}

interface OfficerRow {
  id: string
  name: string
  siteLabel: string
  status: OfficerStatus
  lastSeenAt?: string | null
  locatable: boolean
}

interface LiveIncident {
  id: string
  title: string
  severity: string
  officerName?: string
  description?: string
  checkpointName?: string
}

// Marker fill and badge styling per status. Kept together so the map pin and
// the list badge for a guard always read as the same colour.
const STATUS_META: Record<
  OfficerStatus,
  { label: string; marker: string; badge: string; dot: string }
> = {
  responding: {
    label: 'Responding',
    marker: '#ef4444',
    badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    dot: 'bg-red-500',
  },
  patrol: {
    label: 'On patrol',
    marker: '#2563eb',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  onduty: {
    label: 'On duty',
    marker: '#16a34a',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
}

// A light, decluttered street map — the same look as the product mockup.
// POIs and transit are hidden so guard pins and roads stay legible.
const LIGHT_MAP_STYLES = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
]

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function initialOf(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

function timeAgo(iso?: string | null) {
  if (!iso) return 'No update yet'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'No update yet'
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `Last update: ${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Last update: ${hrs}h ago`
  return `Last update: ${Math.floor(hrs / 24)}d ago`
}

function statusFor(officer: LiveOfficer, responding: Set<string>): OfficerStatus {
  if (responding.has(officer.id)) return 'responding'
  // A guard we have a live position/scan for is "on patrol"; on-duty with no
  // fix yet is just "on duty".
  if (officer.lat != null && officer.lng != null) return 'patrol'
  return 'onduty'
}

export function PatrolMap() {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const mapsRef = useRef<any>(null)
  const infoWindowRef = useRef<any>(null)
  const checkpointMarkersRef = useRef<any[]>([])
  const officerMarkersRef = useRef<Map<string, any>>(new Map())
  const scanMarkersRef = useRef<any[]>([])
  const liveOfficersRef = useRef<Map<string, LiveOfficer>>(new Map())
  const respondingRef = useRef<Set<string>>(new Set())
  // The map is auto-centred only once, on first load. After that the guard's
  // manual pan/zoom is left alone — re-fitting on every poll used to yank the
  // view back out to the whole country.
  const didFitRef = useRef(false)

  const [officers, setOfficers] = useState<OfficerRow[]>([])
  const [counts, setCounts] = useState({
    onDuty: 0,
    responding: 0,
    available: 0,
    unassigned: 0,
  })
  const [latestIncident, setLatestIncident] = useState<LiveIncident | null>(null)
  const [mapError, setMapError] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)

  // Rebuild the React-facing officer list from the imperative marker source of
  // truth, so the panel always mirrors what's on the map.
  const publishOfficers = useCallback(() => {
    const responding = respondingRef.current
    const rows: OfficerRow[] = []
    liveOfficersRef.current.forEach((officer) => {
      const status = statusFor(officer, responding)
      rows.push({
        id: officer.id,
        name: officer.name,
        siteLabel: officer.checkpointName || officer.siteName || 'Unassigned area',
        status,
        lastSeenAt: officer.lastSeenAt,
        locatable: officer.lat != null && officer.lng != null,
      })
    })
    const rank: Record<OfficerStatus, number> = { responding: 0, patrol: 1, onduty: 2 }
    rows.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
    setOfficers(rows)
  }, [])

  const openOfficerInfo = useCallback((id: string) => {
    const maps = mapsRef.current
    const map = mapRef.current
    const marker = officerMarkersRef.current.get(id)
    const officer = liveOfficersRef.current.get(id)
    if (!maps || !map || !marker || !officer) return
    const status = statusFor(officer, respondingRef.current)
    const name = escapeHtml(officer.name)
    const site = officer.checkpointName
      ? escapeHtml(officer.checkpointName)
      : officer.siteName
        ? escapeHtml(officer.siteName)
        : ''
    const lastSeen = officer.lastSeenAt
      ? escapeHtml(formatDate(officer.lastSeenAt))
      : 'Unknown'
    if (!infoWindowRef.current) infoWindowRef.current = new maps.InfoWindow()
    infoWindowRef.current.setContent(
      `<div style="min-width:220px;padding:4px 2px;color:#0f172a;font-family:Arial,sans-serif">
        <div style="font-size:16px;font-weight:700;color:#0f172a">${name}</div>
        <div style="margin-top:4px;font-size:12px;font-weight:600;color:${STATUS_META[status].marker}">${STATUS_META[status].label}</div>
        ${site ? `<div style="margin-top:8px;font-size:13px;color:#334155"><strong style="color:#0f172a">Location:</strong> ${site}</div>` : ''}
        <div style="margin-top:6px;font-size:13px;color:#334155"><strong style="color:#0f172a">Last seen:</strong> ${lastSeen}</div>
      </div>`,
    )
    infoWindowRef.current.open({ map, anchor: marker })
  }, [])

  // "Details" from the panel: recentre on the guard and open their popup.
  const focusOfficer = useCallback(
    (id: string) => {
      const map = mapRef.current
      const marker = officerMarkersRef.current.get(id)
      if (!map || !marker) return
      map.panTo(marker.getPosition())
      if (map.getZoom() < 15) map.setZoom(16)
      openOfficerInfo(id)
    },
    [openOfficerInfo],
  )

  useEffect(() => {
    if (!ref.current || mapRef.current || !ref.current.isConnected) return

    let disposed = false

    const clearMarkers = (markers: any[]) => {
      markers.forEach((marker) => marker.setMap(null))
      markers.length = 0
    }

    const officerIcon = (maps: any, status: OfficerStatus) => ({
      path: maps.SymbolPath.CIRCLE,
      scale: 13,
      fillColor: STATUS_META[status].marker,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    })

    const upsertOfficerMarker = (maps: any, map: any, officer: LiveOfficer) => {
      if (officer.lat == null || officer.lng == null) return
      const status = statusFor(officer, respondingRef.current)
      let marker = officerMarkersRef.current.get(officer.id)
      if (!marker) {
        marker = new maps.Marker({
          map,
          position: { lat: officer.lat, lng: officer.lng },
          title: officer.name,
          icon: officerIcon(maps, status),
          label: { text: initialOf(officer.name), color: '#ffffff', fontSize: '11px', fontWeight: '700' },
        })
        marker.addListener('click', () => openOfficerInfo(officer.id))
        officerMarkersRef.current.set(officer.id, marker)
      } else {
        marker.setPosition({ lat: officer.lat, lng: officer.lng })
        marker.setIcon(officerIcon(maps, status))
        marker.setLabel({ text: initialOf(officer.name), color: '#ffffff', fontSize: '11px', fontWeight: '700' })
      }
    }

    const renderMapData = (
      maps: any,
      checkpoints: Checkpoint[],
      users: User[],
      scans: Scan[],
      incidents: any[],
    ) => {
      const map = mapRef.current
      if (!map) return

      clearMarkers(checkpointMarkersRef.current)
      clearMarkers(scanMarkersRef.current)

      // Guards responding to an open incident — drives both the count and the
      // red pin/badge. Uses real incident data, not a placeholder status.
      respondingRef.current = new Set(
        incidents
          .filter((incident) => incident.status === 'open' || incident.status === 'investigating')
          .map((incident) => incident.officerId)
          .filter(Boolean),
      )

      // Two separate extents: guards get priority for the opening view so it
      // lands at street level where the action is, not zoomed out to fit every
      // checkpoint in the country.
      const officerBounds = new maps.LatLngBounds()
      const checkpointBounds = new maps.LatLngBounds()

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
            scale: 6,
            fillColor: '#0ea5e9',
            fillOpacity: 0.9,
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
        checkpointBounds.extend(marker.getPosition())
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

      users
        .filter((user) => user.role === 'guard' && user.onDuty)
        .forEach((user) => {
          const lastScan = latestByOfficer.get(user.id)
          const siteName = user.sites?.[0]?.name ?? null
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
              siteName,
            })
          } else {
            existing.onDuty = true
            existing.name = user.name
            existing.siteName = siteName
            if (lastScan?.checkpointName) existing.checkpointName = lastScan.checkpointName
            if (!existing.lat && lastScan?.gpsLatitude) {
              existing.lat = lastScan.gpsLatitude
              existing.lng = lastScan.gpsLongitude
              existing.lastSeenAt = lastScan.scannedAt ?? existing.lastSeenAt
            }
          }
        })

      liveOfficersRef.current.forEach((officer, id) => {
        // Off duty — drop them from the live view entirely, even if we still
        // hold an old position. Keeping them left clocked-out guards lingering
        // as "on patrol" from a stale GPS fix days later.
        if (!activeOfficerIds.has(id)) {
          liveOfficersRef.current.delete(id)
          const marker = officerMarkersRef.current.get(id)
          if (marker) {
            marker.setMap(null)
            officerMarkersRef.current.delete(id)
          }
          return
        }
        upsertOfficerMarker(maps, map, officer)
        const marker = officerMarkersRef.current.get(id)
        if (marker) officerBounds.extend(marker.getPosition())
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
              scale: 5,
              fillColor: scan.gpsValid ? '#f59e0b' : '#ef4444',
              fillOpacity: 0.9,
              strokeColor: '#ffffff',
              strokeWeight: 1.5,
            },
          })
          scanMarkersRef.current.push(marker)
        })

      // Auto-centre once. Prefer the guards; fall back to checkpoints only when
      // nobody is on duty. Clamp the zoom so a lone marker doesn't zoom to the
      // rooftop and a wide spread doesn't zoom out past street level.
      if (!didFitRef.current) {
        const target = !officerBounds.isEmpty()
          ? { bounds: officerBounds, min: 14, max: 16 }
          : !checkpointBounds.isEmpty()
            ? { bounds: checkpointBounds, min: 13, max: 16 }
            : null
        if (target) {
          map.fitBounds(target.bounds, 80)
          maps.event.addListenerOnce(map, 'idle', () => {
            const zoom = map.getZoom()
            if (zoom > target.max) map.setZoom(target.max)
            else if (zoom < target.min) map.setZoom(target.min)
          })
          didFitRef.current = true
        }
      }

      const guards = users.filter((user) => user.role === 'guard')
      const onDutyGuards = guards.filter((user) => user.onDuty)
      const respondingCount = onDutyGuards.filter((user) => respondingRef.current.has(user.id)).length
      setCounts({
        onDuty: onDutyGuards.length,
        responding: respondingCount,
        available: onDutyGuards.length - respondingCount,
        unassigned: guards.filter((user) => !user.siteIds?.length && !user.sites?.length).length,
      })
      publishOfficers()
    }

    const init = async () => {
      try {
        const maps = await loadGoogleMaps()
        if (disposed || !ref.current) return
        mapsRef.current = maps

        const map = new maps.Map(ref.current, {
          center: { lat: 6.5244, lng: 3.3792 },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          styles: LIGHT_MAP_STYLES,
        })
        mapRef.current = map

        const fetchAll = async () => {
          const [checkpoints, users, scans, incidents] = await Promise.all([
            api.checkpoints.list(),
            api.users.list(),
            api.scans.recent(),
            api.incidents.list({ status: 'open' }).catch(() => [] as any[]),
          ])
          renderMapData(maps, checkpoints, users, scans, incidents)
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
          // A fresh incident may flip a guard to "responding" — refetch so the
          // panel and pins reflect it.
          void fetchAll()
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

          upsertOfficerMarker(maps, map, liveOfficersRef.current.get(data.userId)!)
          publishOfficers()
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
  }, [openOfficerInfo, publishOfficers])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <div ref={ref} className="h-full w-full" />

      {/* Guard Tracking panel — mirrors the live map, real counts and roster. */}
      {panelOpen ? (
        <div className="absolute left-4 top-4 flex w-72 max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-sm font-semibold text-foreground">Guard Tracking</span>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Collapse guard tracking panel"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-4 divide-x divide-border border-b border-border text-center">
            {[
              { label: 'On duty', value: counts.onDuty, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Respond', value: counts.responding, tone: 'text-red-600 dark:text-red-400' },
              { label: 'Avail', value: counts.available, tone: 'text-blue-600 dark:text-blue-400' },
              { label: 'Unassn', value: counts.unassigned, tone: 'text-muted-foreground' },
            ].map((stat) => (
              <div key={stat.label} className="px-1 py-2.5">
                <div className={`text-lg font-semibold ${stat.tone}`}>{stat.value}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="max-h-72 overflow-y-auto">
            <div className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Guards ({officers.length})
            </div>
            {officers.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                No guards on duty right now.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {officers.map((officer) => (
                  <li key={officer.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                        {initialOf(officer.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{officer.name}</span>
                          <span
                            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[officer.status].badge}`}
                          >
                            {STATUS_META[officer.status].label}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{officer.siteLabel}</div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">{timeAgo(officer.lastSeenAt)}</span>
                          <button
                            onClick={() => focusOfficer(officer.id)}
                            disabled={!officer.locatable}
                            className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur hover:bg-accent"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Guard Tracking · {counts.onDuty}
        </button>
      )}

      {latestIncident ? (
        <div className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-lg border border-red-400/30 bg-red-500/90 px-3 py-2 text-sm text-white shadow-lg backdrop-blur">
          <div className="text-[10px] uppercase tracking-wide text-red-100">Latest incident</div>
          <div className="mt-1 font-medium">{latestIncident.title}</div>
          <div className="text-xs text-red-50/90">
            {latestIncident.severity}
            {latestIncident.officerName ? ` · ${latestIncident.officerName}` : ''}
            {latestIncident.checkpointName ? ` · ${latestIncident.checkpointName}` : ''}
          </div>
          {latestIncident.description ? (
            <div className="mt-1 text-xs text-red-50/80">{latestIncident.description}</div>
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
