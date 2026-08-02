import type { AnalyticsSummary } from '../types'

const DEFAULT_API_BASE = '/api/v1'

function normalizeApiBase(rawUrl: string | undefined) {
  const trimmed = rawUrl?.trim()
  if (!trimmed) return DEFAULT_API_BASE
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(candidate)
    if (url.hostname.endsWith('.convex.cloud')) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, '.convex.site')
      url.pathname = '/api/v1'
    } else if (url.hostname.endsWith('.convex.site') && !url.pathname.startsWith('/api/v1')) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/api/v1`
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_API_BASE
  }
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL)

export function apiFileUrl(path: string) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  if (API_BASE.startsWith('http')) {
    const base = new URL(API_BASE)
    return `${base.origin}${path.startsWith('/') ? path : `/${path}`}`
  }
  return path
}

function emitAppEvent(name: string, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

// localStorage keys for the staff dashboard session.
export const ACCESS_TOKEN_KEY = 'patrol_token'
export const REFRESH_TOKEN_KEY = 'patrol_refresh'
export const USER_STORAGE_KEY = 'patrol_user'

const REQUEST_TIMEOUT = 30_000

// Endpoints that must NEVER trigger a silent refresh (they either mint tokens
// or are the refresh itself — refreshing here would loop or be meaningless).
const AUTH_PATHS_NO_REFRESH = ['/auth/login', '/auth/refresh']

// Single-flight refresh: if several requests 401 at once we only hit /auth/refresh
// ONCE and they all await the same result.
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) return null

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) return null
        const data = await res.json().catch(() => null)
        if (!data?.token || !data?.refreshToken) return null
        localStorage.setItem(ACCESS_TOKEN_KEY, data.token)
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken)
        if (data.user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user))
        return data.token as string
      } catch {
        return null
      }
    })()
    refreshInFlight.finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

// Clears the session and tells the app to bounce the user to the login screen.
// Used when a refresh is impossible (idle >1h or session >24h old).
function forceSessionExpiry() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
  emitAppEvent('app:session-expired')
}

// How many times to transparently retry a 429 (rate limited) or 503 (server
// shedding load) before surfacing the error to the caller.
const MAX_RATE_LIMIT_RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Milliseconds to wait before retrying a throttled/shed request. Prefers the
// server's Retry-After (seconds), else falls back to exponential backoff with
// jitter. Capped so a busy server can't park the UI for too long.
function retryDelayMs(retryAfterHeader: string | null, attempt: number): number {
  const fromHeader = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN
  const base = Number.isFinite(fromHeader) && fromHeader > 0
    ? fromHeader
    : Math.min(2 ** attempt * 500, 8000)
  const jitter = Math.random() * 300
  return Math.min(base + jitter, 10000)
}

async function request<T>(
  path: string,
  options?: RequestInit,
  allowRefresh = true,
  retryCount = 0,
): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const error = new Error('You have a poor network connection or you are offline. Please try again.')
    emitAppEvent('app:request-error', { message: error.message, kind: 'network' })
    throw error
  }
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  if (options?.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { ...headers, ...options?.headers as Record<string, string> },
      signal: controller.signal,
      ...options,
    })
  } catch (cause) {
    clearTimeout(timeout)
    const isTimeout = cause instanceof DOMException && cause.name === 'AbortError'
    const details = isTimeout ? ' (request timed out)' : cause instanceof Error ? ` (${cause.message})` : ''
    const error = new Error(`The request could not reach the API server${details}. Please try again.`)
    emitAppEvent('app:request-error', { message: error.message, kind: 'network' })
    throw error
  }

  clearTimeout(timeout)

  // Access token expired (or missing): try ONE silent refresh, then retry the
  // original request. If the refresh fails the session is truly over -> logout.
  if (
    res.status === 401 &&
    allowRefresh &&
    token &&
    !AUTH_PATHS_NO_REFRESH.some((p) => path.startsWith(p))
  ) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      return request<T>(path, options, false)
    }
    forceSessionExpiry()
  }

  // Throttled (429) or the server is shedding load (503). Honor Retry-After and
  // transparently retry a few times with backoff before giving up, so a brief
  // spike is invisible to the user instead of a hard error.
  if ((res.status === 429 || res.status === 503) && retryCount < MAX_RATE_LIMIT_RETRIES) {
    await sleep(retryDelayMs(res.headers.get('Retry-After'), retryCount))
    return request<T>(path, options, allowRefresh, retryCount + 1)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    const message = err.message || err.error || 'Request failed'
    emitAppEvent('app:request-error', {
      message,
      kind: res.status >= 500 ? 'server' : 'request',
      status: res.status,
    })
    throw new Error(message)
  }

  emitAppEvent('app:request-success', { path })
  return res.json()
}

// Same auth/refresh behaviour as request(), but for binary downloads (PDFs).
async function requestBlob(path: string, allowRefresh = true): Promise<Blob> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (res.status === 401 && allowRefresh && token) {
    const newToken = await refreshAccessToken()
    if (newToken) return requestBlob(path, false)
    forceSessionExpiry()
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.error || 'Download failed')
  }
  return res.blob()
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; refreshToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, clientType: 'web' }),
      }),
    me: () => request<{ user: any }>('/auth/me'),
    // Revokes the whole refresh-token family server-side. Best-effort: the
    // caller clears local state regardless of whether this reaches the server.
    logout: (refreshToken: string) =>
      request<{ message: string }>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),
  },
  scans: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/scans?${new URLSearchParams(params)}`),
    recent: () => request<any[]>('/scans/recent'),
    get: (id: string) => request<any>(`/scans/${id}`),
    exportDaily: (data: { date: string; format?: 'xlsx' }) =>
      request<any>('/scans/export/daily', { method: 'POST', body: JSON.stringify(data) }),
    listDailyExports: () => request<any[]>('/scans/export/daily'),
  },
  checkpoints: {
    list: () => request<any[]>('/checkpoints'),
    create: (data: any) =>
      request<any>('/checkpoints', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/checkpoints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/checkpoints/${id}`, { method: 'DELETE' }),
  },
  reports: {
    list: (params?: Record<string, string>) =>
      request<{ reports: any[]; submissions: any[] }>(`/reports?${new URLSearchParams(params || {})}`),
    // Files a report from a category template, addressed to a client.
    create: (data: { category: string; clientId: string; siteId?: string | null; title?: string; fields: Record<string, string> }) =>
      request<any>('/reports', { method: 'POST', body: JSON.stringify(data) }),
    generate: (data?: any) =>
      request<any>('/reports/generate', { method: 'POST', body: JSON.stringify(data || {}) }),
    // Sends a drafted report to a client so it appears in their portal. Pass
    // clientId to choose/confirm exactly which client receives it.
    send: (id: string, clientId?: string) =>
      request<{ id: string; status: string; clientName: string | null }>(
        `/reports/${id}/send`,
        { method: 'POST', body: JSON.stringify(clientId ? { clientId } : {}) },
      ),
    // Authenticated download — the endpoint needs the Bearer token, so a
    // plain link would 401; callers get a Blob to hand to the browser.
    pdf: (id: string) => requestBlob(`/reports/${id}/pdf`),
  },
  users: {
    list: () => request<any[]>('/users'),
    get: (id: string) => request<any>(`/users/${id}`),
    create: (data: any) =>
      request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
    // Removes the profile, login and postings. Patrol history is kept — see
    // `users.remove` in convex for why, and `deletionImpact` for the numbers
    // to show before confirming.
    remove: (id: string) =>
      request<{ message: string; name: string }>(`/users/${id}`, { method: 'DELETE' }),
  },
  // What a delete would remove and what it would keep, for the confirm dialogs.
  deletionImpact: {
    user: (id: string) =>
      request<{
        name: string
        role: string
        isLastAdmin: boolean
        onDuty: boolean
        scans: number
        shifts: number
        incidents: number
        assignedSites: string[]
      }>(`/deletion-impact?type=user&id=${encodeURIComponent(id)}`),
    site: (id: string) =>
      request<{
        name: string
        subLocations: number
        qrCodes: number
        scans: number
        activePostOrders: number
        assignedGuards: string[]
      }>(`/deletion-impact?type=site&id=${encodeURIComponent(id)}`),
  },
  // Guard <-> location posting. Scans at a location are rejected unless the
  // guard is assigned to it, and the client portal's coverage numbers count
  // these assignments.
  siteAssignments: {
    assign: (siteId: string, userId: string) =>
      request<any>('/site-assignments', { method: 'POST', body: JSON.stringify({ siteId, userId }) }),
    unassign: (siteId: string, userId: string) =>
      request<any>('/site-assignments', { method: 'DELETE', body: JSON.stringify({ siteId, userId }) }),
  },
  shifts: {
    status: () => request<{ active: boolean; shift: any }>('/shifts/status'),
    clockIn: () =>
      request<any>('/shifts/clock-in', { method: 'POST' }),
    clockOut: () =>
      request<any>('/shifts/clock-out', { method: 'POST' }),
    list: () => request<any[]>('/shifts'),
    missingClockins: () => request<any[]>('/shifts/missing-clockins'),
  },
  incidents: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/incidents?${new URLSearchParams(params)}`),
    create: (data: any) =>
      request<any>('/incidents', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      request<any>(`/incidents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    missedPatrols: () => request<any[]>('/incidents/missed-patrols'),
  },
  missedPatrols: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/missed-patrols?${new URLSearchParams(params || {})}`),
    checkNow: () => request<any>('/missed-patrols/check', { method: 'POST' }),
  },
  timesheets: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/timesheets?${new URLSearchParams(params)}`),
    summary: () => request<any>('/timesheets/summary'),
  },
  postOrders: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/post-orders?${new URLSearchParams(params)}`),
    // Staff management listing (guard names, created date, ack history).
    manage: () => request<any[]>('/post-orders/manage'),
    create: (data: any) =>
      request<any>('/post-orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/post-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<any>(`/post-orders/${id}`, { method: 'DELETE' }),
    completions: () => request<any[]>('/post-orders/completions'),
    reviewCompletion: (id: string, data: any) =>
      request<any>(`/post-orders/completions/${id}/review`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  handovers: {
    list: () => request<any[]>('/handovers'),
    updateStatus: (id: string, status: string) =>
      request<any>(`/handovers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  clients: {
    list: () => request<any[]>('/clients'),
    // Full drill-down: client info + portal logins + locations + sub-locations.
    get: (id: string) => request<any>(`/clients/${id}`),
    // Creates the company AND its portal login; `password` is required.
    create: (data: any) =>
      request<any>('/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  sites: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/sites?${new URLSearchParams(params || {})}`),
    create: (data: any) =>
      request<any>('/sites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    // Deletes the location and every QR code inside it. Scans taken there are
    // kept as history.
    remove: (id: string) =>
      request<{ message: string; name: string }>(`/sites/${id}`, { method: 'DELETE' }),
  },
  passOnLogs: {
    list: () => request<any[]>('/pass-on-logs'),
    create: (data: any) =>
      request<any>('/pass-on-logs', { method: 'POST', body: JSON.stringify(data) }),
  },
  emergency: {
    settings: () => request<any[]>('/emergency/settings'),
    saveSetting: (data: { settingKey: string; settingValue: string; scopeType?: string; scopeId?: string }) =>
      request<any>('/emergency/settings', { method: 'POST', body: JSON.stringify(data) }),
  },
  activity: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/activity-summary?${new URLSearchParams(params)}`),
    exportCsv: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : ''
      return `${API_BASE}/activity-summary/export${qs}`
    },
  },
  // Aggregates over real scans, shifts, incidents and reports. `clientId` and
  // `siteId` narrow the scope; omit both for the whole organisation.
  analytics: {
    summary: (params?: { days?: number; clientId?: string; siteId?: string }) => {
      const qs = new URLSearchParams()
      if (params?.days) qs.set('days', String(params.days))
      if (params?.clientId) qs.set('clientId', params.clientId)
      if (params?.siteId) qs.set('siteId', params.siteId)
      return request<AnalyticsSummary>(`/analytics?${qs}`)
    },
  },
  ai: {
    chat: (data: { message: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> }) =>
      request<{
        answer: string
        intent: string
        model?: string | null
        assistantUnavailable?: boolean
        generatedReportId?: string | null
        sources?: string[]
      }>('/ai/chat', { method: 'POST', body: JSON.stringify(data) }),
    reports: () => request<any[]>('/ai/reports'),
    architecture: () => request<any>('/ai/architecture'),
  },
}
