import { io, Socket } from 'socket.io-client'
import { API_BASE } from './api'

// Only dial Socket.IO when a server is explicitly configured — there is no
// socket server behind the Convex HTTP API, and an unconfigured client would
// retry localhost forever, spamming connection errors. Polling covers realtime.
const WS_URL = import.meta.env.VITE_WS_URL || ''

let socket: Socket | null = null
let realtimeTimer: number | null = null
let realtimeBootstrapped = false
let incidentsBootstrapped = false
let pollTick = 0
let shiftSignature = ''
const knownScanIds = new Set<string>()
const knownIncidentIds = new Set<string>()
const scanSubscribers = new Set<(data: any) => void>()
const alertSubscribers = new Set<(data: any) => void>()
const shiftSubscribers = new Set<(data: any) => void>()
const incidentSubscribers = new Set<(data: any) => void>()
const emergencySubscribers = new Set<(data: any) => void>()
const positionSubscribers = new Set<(data: any) => void>()

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('patrol_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchJson(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}

function emitTo(subscribers: Set<(data: any) => void>, data: any) {
  subscribers.forEach((callback) => callback(data))
}

function ensureRealtimeFallback() {
  if (typeof window === 'undefined' || realtimeTimer != null) return

  const poll = async () => {
    if (!localStorage.getItem('patrol_token')) return

    // Incidents change far less often than scans; poll them every 5th tick.
    const shouldPollIncidents =
      incidentSubscribers.size > 0 && (pollTick % 5 === 0 || !incidentsBootstrapped)
    pollTick += 1

    try {
      const [scans, shifts, incidents] = await Promise.all([
        scanSubscribers.size > 0 || alertSubscribers.size > 0 || positionSubscribers.size > 0
          ? fetchJson('/scans?limit=20').catch(() => [])
          : Promise.resolve([]),
        shiftSubscribers.size > 0
          ? fetchJson('/shifts').catch(() => [])
          : Promise.resolve([]),
        shouldPollIncidents
          ? fetchJson('/incidents').catch(() => null)
          : Promise.resolve(null),
      ])

      if (Array.isArray(scans)) {
        const newestFirst = scans.slice(0, 20)
        const unseen = newestFirst.filter((scan) => scan?.id && !knownScanIds.has(scan.id))
        newestFirst.forEach((scan) => {
          if (scan?.id) knownScanIds.add(scan.id)
        })

        if (realtimeBootstrapped) {
          unseen.reverse().forEach((scan) => {
            emitTo(scanSubscribers, scan)
            if (scan?.gpsValid === false) emitTo(alertSubscribers, scan)
            if (scan?.gpsLatitude != null && scan?.gpsLongitude != null) {
              emitTo(positionSubscribers, {
                userId: scan.officerId,
                name: scan.officerName,
                latitude: scan.gpsLatitude,
                longitude: scan.gpsLongitude,
                capturedAt: scan.scannedAt,
                onDuty: true,
              })
            }
          })
        }
      }

      if (Array.isArray(shifts)) {
        const nextSignature = shifts
          .slice(0, 25)
          .map((shift) => `${shift.id}:${shift.status}:${shift.clockIn}:${shift.clockOut ?? ''}`)
          .join('|')
        if (realtimeBootstrapped && shiftSignature && nextSignature !== shiftSignature) {
          emitTo(shiftSubscribers, shifts[0] ?? {})
        }
        shiftSignature = nextSignature
      }

      if (Array.isArray(incidents)) {
        const unseenIncidents = incidents.filter(
          (incident) => incident?.id && !knownIncidentIds.has(incident.id),
        )
        incidents.forEach((incident) => {
          if (incident?.id) knownIncidentIds.add(incident.id)
        })
        if (incidentsBootstrapped) {
          unseenIncidents.reverse().forEach((incident) => emitTo(incidentSubscribers, incident))
        }
        incidentsBootstrapped = true
      }

      realtimeBootstrapped = true
    } catch {
      // The Socket.IO path still handles realtime on the Express API. Polling is best-effort for Convex HTTP.
    }
  }

  void poll()
  realtimeTimer = window.setInterval(poll, 1000)
}

function stopRealtimeFallbackIfIdle() {
  if (
    scanSubscribers.size ||
    alertSubscribers.size ||
    shiftSubscribers.size ||
    incidentSubscribers.size ||
    emergencySubscribers.size ||
    positionSubscribers.size
  ) {
    return
  }
  if (realtimeTimer != null) {
    window.clearInterval(realtimeTimer)
    realtimeTimer = null
  }
}

export function connectSocket(token: string) {
  if (!WS_URL) {
    ensureRealtimeFallback()
    return null
  }
  if (socket?.connected) return socket

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => console.log('[WS] Connected'))
  socket.on('disconnect', (reason) => console.log('[WS] Disconnected:', reason))
  socket.on('connect_error', (err) => console.error('[WS] Error:', err.message))
  socket.on('scan:new', (data) => emitTo(scanSubscribers, data))
  socket.on('scan:alert', (data) => emitTo(alertSubscribers, data))
  socket.on('shift:update', (data) => emitTo(shiftSubscribers, data))
  socket.on('incident:new', (data) => emitTo(incidentSubscribers, data))
  socket.on('emergency:new', (data) => emitTo(emergencySubscribers, data))
  socket.on('position:update', (data) => emitTo(positionSubscribers, data))

  ensureRealtimeFallback()

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  if (realtimeTimer != null) {
    window.clearInterval(realtimeTimer)
    realtimeTimer = null
  }
  realtimeBootstrapped = false
  incidentsBootstrapped = false
  pollTick = 0
  shiftSignature = ''
  knownScanIds.clear()
  knownIncidentIds.clear()
}

export function subscribeToScans(callback: (data: any) => void) {
  scanSubscribers.add(callback)
  ensureRealtimeFallback()
  return () => {
    scanSubscribers.delete(callback)
    stopRealtimeFallbackIfIdle()
  }
}

export function subscribeToAlerts(callback: (data: any) => void) {
  alertSubscribers.add(callback)
  ensureRealtimeFallback()
  return () => {
    alertSubscribers.delete(callback)
    stopRealtimeFallbackIfIdle()
  }
}

export function subscribeToShiftUpdates(callback: (data: any) => void) {
  shiftSubscribers.add(callback)
  ensureRealtimeFallback()
  return () => {
    shiftSubscribers.delete(callback)
    stopRealtimeFallbackIfIdle()
  }
}

export function subscribeToIncidents(callback: (data: any) => void) {
  incidentSubscribers.add(callback)
  ensureRealtimeFallback()
  return () => {
    incidentSubscribers.delete(callback)
    stopRealtimeFallbackIfIdle()
  }
}

export function subscribeToEmergency(callback: (data: any) => void) {
  emergencySubscribers.add(callback)
  ensureRealtimeFallback()
  return () => {
    emergencySubscribers.delete(callback)
    stopRealtimeFallbackIfIdle()
  }
}

export function subscribeToPositionUpdates(callback: (data: any) => void) {
  positionSubscribers.add(callback)
  ensureRealtimeFallback()
  return () => {
    positionSubscribers.delete(callback)
    stopRealtimeFallbackIfIdle()
  }
}
