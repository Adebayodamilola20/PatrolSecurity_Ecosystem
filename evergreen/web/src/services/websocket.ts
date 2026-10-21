import { io, Socket } from 'socket.io-client'
import { API_BASE } from './api'

// Only dial Socket.IO when a server is explicitly configured — there is no
// socket server behind the Convex HTTP API, and an unconfigured client would
// retry localhost forever, spamming connection errors. Polling covers realtime.
const WS_URL = import.meta.env.VITE_WS_URL || ''

// One poll every 10s, not every 1s: each tick fetches /scans (and /shifts,
// /incidents), so a 1s loop cost one open tab ~86,400 polls a day while staff
// saw no difference — guards scan minutes apart, not seconds apart.
const POLL_INTERVAL_MS = 10_000
// A request that never settles would hold the in-flight flag forever and
// silently stop all polling, so each poll's requests are abandoned after this.
const POLL_REQUEST_TIMEOUT_MS = 15_000

let socket: Socket | null = null
let realtimeTimer: number | null = null
// Each stream is "bootstrapped" once it has actually been fetched: its first
// response only records what already exists, later ones emit what is new. One
// shared flag used to be set by the poll that runs at sign-in, before anything
// subscribes, so the first real /scans response replayed all 20 recent scans as
// "new" — and every screen that refetches per scan (map, timesheets) fired 20
// reloads at once.
let scansBootstrapped = false
let shiftsBootstrapped = false
let incidentsBootstrapped = false
let shiftSignature = ''
// Streams requested at least once this session, whatever the outcome. Only a
// never-requested stream may be fetched outside the 10s cadence; one whose
// first fetch failed waits for the ticks, or a screen re-subscribing on every
// navigation could hammer an endpoint that is already failing.
const streamsRequested: Streams = { scans: false, shifts: false, incidents: false }
// Polls never overlap: a tick that lands while the previous poll is still
// waiting on the server is skipped rather than stacking a second request.
let pollInFlight = false
let pollAbort: AbortController | null = null
// A stream that gained its first subscriber while a poll was in flight; it is
// started as soon as that poll settles.
let coldStartPending = false
// Bumped on disconnect (logout), so a poll still in flight from the previous
// session can neither deliver its results nor clear the next session's flag.
let pollEpoch = 0
let lastPollStartedAt = 0
const knownScanIds = new Set<string>()
const knownIncidentIds = new Set<string>()
const scanSubscribers = new Set<(data: any) => void>()
const alertSubscribers = new Set<(data: any) => void>()
const shiftSubscribers = new Set<(data: any) => void>()
const incidentSubscribers = new Set<(data: any) => void>()
const emergencySubscribers = new Set<(data: any) => void>()
const positionSubscribers = new Set<(data: any) => void>()

interface Streams {
  scans: boolean
  shifts: boolean
  incidents: boolean
}

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('patrol_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchJson(path: string, signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(), signal })
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}

function emitTo(subscribers: Set<(data: any) => void>, data: any) {
  subscribers.forEach((callback) => callback(data))
}

function isTabHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

// Only what some screen is listening for is fetched.
function wantedStreams(): Streams {
  return {
    scans: scanSubscribers.size > 0 || alertSubscribers.size > 0 || positionSubscribers.size > 0,
    shifts: shiftSubscribers.size > 0,
    incidents: incidentSubscribers.size > 0,
  }
}

function coldStreams(): Streams {
  const wanted = wantedStreams()
  return {
    scans: wanted.scans && !streamsRequested.scans,
    shifts: wanted.shifts && !streamsRequested.shifts,
    incidents: wanted.incidents && !streamsRequested.incidents,
  }
}

function anyStream(streams: Streams) {
  return streams.scans || streams.shifts || streams.incidents
}

async function poll(streams: Streams = wantedStreams()) {
  if (pollInFlight || isTabHidden()) return
  if (!localStorage.getItem('patrol_token')) return
  // Nothing to fetch (e.g. the poll at sign-in, before any screen subscribes).
  // Returning before lastPollStartedAt is touched means a poll that requested
  // nothing cannot delay the first real one.
  if (!anyStream(streams)) return

  const epoch = pollEpoch
  const abort = new AbortController()
  const abortTimer = window.setTimeout(() => abort.abort(), POLL_REQUEST_TIMEOUT_MS)
  pollInFlight = true
  pollAbort = abort
  lastPollStartedAt = Date.now()
  if (streams.scans) streamsRequested.scans = true
  if (streams.shifts) streamsRequested.shifts = true
  if (streams.incidents) streamsRequested.incidents = true

  try {
    // Incidents are polled on every tick now that a tick is 10s apart, so an
    // incident toast still reaches the control room within ~10s.
    // A failed or skipped fetch is null, not []: an empty list would read as
    // "every shift changed" and fire a spurious update (and a refetch on every
    // subscribed screen) exactly when the server is already struggling.
    const [scans, shifts, incidents] = await Promise.all([
      streams.scans
        ? fetchJson('/scans?limit=20', abort.signal).catch(() => null)
        : Promise.resolve(null),
      streams.shifts
        ? fetchJson('/shifts', abort.signal).catch(() => null)
        : Promise.resolve(null),
      streams.incidents
        ? fetchJson('/incidents', abort.signal).catch(() => null)
        : Promise.resolve(null),
    ])

    // Signed out (or signed in as someone else) while this was in flight.
    if (epoch !== pollEpoch) return

    if (Array.isArray(scans)) {
      const newestFirst = scans.slice(0, 20)
      const unseen = newestFirst.filter((scan) => scan?.id && !knownScanIds.has(scan.id))
      newestFirst.forEach((scan) => {
        if (scan?.id) knownScanIds.add(scan.id)
      })

      if (scansBootstrapped) {
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
      scansBootstrapped = true
    }

    if (Array.isArray(shifts)) {
      const nextSignature = shifts
        .slice(0, 25)
        .map((shift) => `${shift.id}:${shift.status}:${shift.clockIn}:${shift.clockOut ?? ''}`)
        .join('|')
      if (shiftsBootstrapped && nextSignature !== shiftSignature) {
        emitTo(shiftSubscribers, shifts[0] ?? {})
      }
      shiftSignature = nextSignature
      shiftsBootstrapped = true
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
  } catch {
    // The Socket.IO path still handles realtime on the Express API. Polling is best-effort for Convex HTTP.
  } finally {
    window.clearTimeout(abortTimer)
    // A stale poll from a previous session must not release the current
    // session's flag — that is what would let two polls overlap.
    if (epoch === pollEpoch) {
      pollInFlight = false
      pollAbort = null
      if (coldStartPending) {
        coldStartPending = false
        startColdStreams()
      }
    }
  }
}

function startPollTimer() {
  if (realtimeTimer != null) window.clearInterval(realtimeTimer)
  realtimeTimer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
}

// A screen that starts listening to a stream nobody has fetched yet gets it at
// once, not up to 10s later. That matters beyond speed: the first response is
// the baseline, so anything that arrived between the screen's own load and a
// late baseline would be absorbed into it and never shown. Only streams never
// requested this session are fetched, and the cadence restarts from here, so
// no endpoint is asked twice within 10s.
function startColdStreams() {
  if (realtimeTimer == null) return
  const cold = coldStreams()
  if (!anyStream(cold)) return
  if (pollInFlight) {
    coldStartPending = true
    return
  }
  // A hidden tab starts them when it is next shown (see below).
  if (isTabHidden()) return
  void poll(cold)
  startPollTimer()
}

// A hidden tab skips its ticks (nobody is looking at it). When it comes back,
// catch up at once and restart the 10s cadence from that poll — but only if a
// full interval has passed, so flicking between tabs cannot poll faster.
function handleVisibilityChange() {
  if (isTabHidden() || realtimeTimer == null) return
  if (Date.now() - lastPollStartedAt < POLL_INTERVAL_MS) {
    startColdStreams()
    return
  }
  void poll()
  startPollTimer()
}

function ensureRealtimeFallback() {
  if (typeof window === 'undefined') return

  if (realtimeTimer == null) {
    // The interval and the visibility listener live and die together (see
    // stopRealtimeTimer), so neither can outlast the other.
    startPollTimer()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    // Restarting after a brief idle (e.g. navigating between pages) must not
    // sneak in an extra poll inside the 10s window.
    if (Date.now() - lastPollStartedAt >= POLL_INTERVAL_MS) {
      void poll()
      return
    }
  }
  startColdStreams()
}

function stopRealtimeTimer() {
  if (realtimeTimer != null) {
    window.clearInterval(realtimeTimer)
    realtimeTimer = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
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
  stopRealtimeTimer()
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
  stopRealtimeTimer()
  // Retire any poll still in flight: abort its requests, and bump the epoch so
  // its results are dropped instead of seeding the next session's state.
  pollEpoch += 1
  pollAbort?.abort()
  pollAbort = null
  pollInFlight = false
  coldStartPending = false
  lastPollStartedAt = 0
  scansBootstrapped = false
  shiftsBootstrapped = false
  incidentsBootstrapped = false
  streamsRequested.scans = false
  streamsRequested.shifts = false
  streamsRequested.incidents = false
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
