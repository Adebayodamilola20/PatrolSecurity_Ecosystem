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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
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

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.error || 'Request failed')
  }

  return res.json()
}

export const api = {
  auth: {
    // clientType: 'client' tells the backend this is the client portal, so it
    // should ONLY accept main_account (client) accounts here.
    login: (email: string, password: string) =>
      request<{ token: string; user: ClientUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, clientType: 'client' }),
      }),
    me: () => request<{ user: ClientUser }>('/auth/me'),
    forgotPassword: (email: string) =>
      request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  },
  // All of the following are server-tenant-scoped to the caller's clientId.
  overview: () => request<ClientOverview>('/client/overview'),
  guards: {
    list: () => request<ClientGuard[]>('/client/guards'),
    get: (id: string) => request<ClientGuard>(`/client/guards/${id}`),
  },
  scans: {
    list: (params?: Record<string, string>) =>
      request<ClientScan[]>(`/client/scans?${new URLSearchParams(params || {})}`),
  },
  checkpoints: {
    list: () => request<ClientCheckpoint[]>('/client/checkpoints'),
  },
  reports: {
    list: () => request<ClientReport[]>('/client/reports'),
    pdfUrl: (id: string) => `${API_BASE}/client/reports/${id}/pdf`,
  },
}

// Lightweight local types re-exported for convenience; see ../types for the
// shared definitions.
import type {
  ClientUser,
  ClientOverview,
  ClientGuard,
  ClientScan,
  ClientCheckpoint,
  ClientReport,
} from '../types'
