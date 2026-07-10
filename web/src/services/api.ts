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

const REQUEST_TIMEOUT = 30_000

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const error = new Error('You have a poor network connection or you are offline. Please try again.')
    emitAppEvent('app:request-error', { message: error.message, kind: 'network' })
    throw error
  }
  const token = localStorage.getItem('patrol_token')
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

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, clientType: 'web' }),
      }),
    me: () => request<{ user: any }>('/auth/me'),
    forgotPassword: (email: string) =>
      request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
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
    list: () => request<{ reports: any[]; submissions: any[] }>('/reports'),
    generate: (data?: any) =>
      request<any>('/reports/generate', { method: 'POST', body: JSON.stringify(data || {}) }),
    resend: (id: string) =>
      request<any>(`/reports/${id}/resend`, { method: 'POST' }),
    pdf: (id: string) => `${API_BASE}/reports/${id}/pdf`,
  },
  users: {
    list: () => request<any[]>('/users'),
    get: (id: string) => request<any>(`/users/${id}`),
    create: (data: any) =>
      request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
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
    create: (data: any) =>
      request<any>('/post-orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/post-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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
