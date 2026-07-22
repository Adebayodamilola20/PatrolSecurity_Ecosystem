// Client Portal API client.
//
// SECURITY MODEL: every data endpoint here lives under the `/client/*` namespace.
// Those endpoints resolve the tenant (clientId) from the authenticated session
// token on the SERVER and filter by it there. The frontend must NEVER send a
// clientId and the server must NEVER trust one if it did. This keeps a client
// from ever seeing another client's guards/scans/checkpoints.
//
// (The `/client/*` backend routes are being built — see Codex handoff. Until
// they land, these calls will 404; the UI handles empty/error states.)

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

// Storage keys are namespaced so a client session never collides with the
// staff dashboard session if both happen to be open on the same origin.
export const TOKEN_KEY = 'patrol_client_token'
export const REFRESH_KEY = 'patrol_client_refresh'
export const USER_KEY = 'patrol_client_user'

export function apiFileUrl(path: string) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  if (API_BASE.startsWith('http')) {
    const base = new URL(API_BASE)
    return `${base.origin}${path.startsWith('/') ? path : `/${path}`}`
  }
  return path
}

const REQUEST_TIMEOUT = 30_000

// Endpoints that must never trigger a silent refresh (they mint tokens or ARE
// the refresh call).
const AUTH_PATHS_NO_REFRESH = ['/auth/login', '/auth/refresh']

// Single-flight refresh so concurrent 401s only hit /auth/refresh once.
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
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
        localStorage.setItem(TOKEN_KEY, data.token)
        localStorage.setItem(REFRESH_KEY, data.refreshToken)
        if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user))
        return data.token as string
      } catch {
        return null
      }
    })()
    refreshInFlight.finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

// Clears the client session and signals the app to route back to login. Fired
// when a refresh is no longer possible (idle >1h or session >24h old).
function forceSessionExpiry() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('client:session-expired'))
  }
}

// How many times to transparently retry a 429 (rate limited) or 503 (server
// shedding load) before surfacing the error to the caller.
const MAX_RATE_LIMIT_RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Prefer the server's Retry-After (seconds); else exponential backoff + jitter,
// capped so a busy server can't park the UI for too long.
function retryDelayMs(retryAfterHeader: string | null, attempt: number): number {
  const fromHeader = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN
  const base = Number.isFinite(fromHeader) && fromHeader > 0
    ? fromHeader
    : Math.min(2 ** attempt * 500, 8000)
  return Math.min(base + Math.random() * 300, 10000)
}

async function request<T>(
  path: string,
  options?: RequestInit,
  allowRefresh = true,
  retryCount = 0,
): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You appear to be offline. Please check your connection and try again.')
  }
  const token = localStorage.getItem(TOKEN_KEY)
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
      headers: { ...headers, ...(options?.headers as Record<string, string>) },
      signal: controller.signal,
      ...options,
    })
  } catch (cause) {
    clearTimeout(timeout)
    const isTimeout = cause instanceof DOMException && cause.name === 'AbortError'
    const details = isTimeout ? ' (request timed out)' : cause instanceof Error ? ` (${cause.message})` : ''
    throw new Error(`The request could not reach the server${details}. Please try again.`)
  }

  clearTimeout(timeout)

  // Access token expired: try one silent refresh then retry. If refresh fails
  // the session is over -> clear and bounce to login.
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

  // Throttled (429) or server shedding load (503): honor Retry-After and retry
  // a few times with backoff before surfacing an error, so a brief spike stays
  // invisible to the user.
  if ((res.status === 429 || res.status === 503) && retryCount < MAX_RATE_LIMIT_RETRIES) {
    await sleep(retryDelayMs(res.headers.get('Retry-After'), retryCount))
    return request<T>(path, options, allowRefresh, retryCount + 1)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.error || 'Request failed')
  }

  return res.json()
}

// Same auth/refresh behaviour as request(), but for binary downloads (PDFs).
async function requestBlob(path: string, allowRefresh = true): Promise<Blob> {
  const token = localStorage.getItem(TOKEN_KEY)
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
    // clientType: 'client' tells the backend this is the client portal, so it
    // should ONLY accept main_account (client) accounts here.
    login: (email: string, password: string) =>
      request<{ token: string; refreshToken: string; user: ClientUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, clientType: 'client' }),
      }),
    me: () => request<{ user: ClientUser }>('/auth/me'),
    // Revokes the whole refresh-token family server-side. Best-effort: the
    // caller clears local state regardless of whether this reaches the server.
    logout: (refreshToken: string) =>
      request<{ message: string }>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),
    forgotPassword: (email: string) =>
      request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  },
  // All of the following are server-tenant-scoped to the caller's clientId.
  overview: () => request<ClientOverview>('/client/overview'),
  guards: {
    // Numbers only — clients never see guard identities (names/photos/etc).
    stats: () => request<ClientGuardStats>('/client/guard-stats'),
  },
  scans: {
    list: (params?: Record<string, string>) =>
      request<ClientScan[]>(`/client/scans?${new URLSearchParams(params || {})}`),
  },
  checkpoints: {
    list: () => request<ClientCheckpoint[]>('/client/checkpoints'),
  },
  // The tenant's own hierarchy: locations -> sub-locations with scan
  // verification activity. Everything is created by staff on the admin
  // dashboard and simply appears here — clients never configure anything.
  sites: {
    list: () => request<{ sites: ClientSiteDetail[] }>('/client/sites'),
  },
  reports: {
    list: () => request<ClientReport[]>('/client/reports'),
    // Authenticated download of the (guard-anonymized) report PDF.
    pdf: (id: string) => requestBlob(`/client/reports/${id}/pdf`),
  },
  // Aggregates over the tenant's own patrol record. `siteId` narrows to one
  // location; omit it for every location on the account.
  analytics: {
    summary: (params?: { days?: number; siteId?: string }) => {
      const qs = new URLSearchParams()
      if (params?.days) qs.set('days', String(params.days))
      if (params?.siteId) qs.set('siteId', params.siteId)
      return request<AnalyticsSummary>(`/client/analytics?${qs}`)
    },
  },
}

// Lightweight local types re-exported for convenience; see ../types for the
// shared definitions.
import type {
  ClientUser,
  ClientOverview,
  ClientGuardStats,
  ClientScan,
  ClientCheckpoint,
  ClientSiteDetail,
  ClientReport,
  AnalyticsSummary,
} from '../types'
