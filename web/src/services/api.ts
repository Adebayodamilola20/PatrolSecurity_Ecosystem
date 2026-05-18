const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

function emitAppEvent(name: string, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

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

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { ...headers, ...options?.headers as Record<string, string> },
      ...options,
    })
  } catch {
    const error = new Error('You have a poor network connection or the server is unreachable. Please try again.')
    emitAppEvent('app:request-error', { message: error.message, kind: 'network' })
    throw error
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    const message = err.message || 'Request failed'
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
        body: JSON.stringify({ email, password }),
      }),
  },
  scans: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/scans?${new URLSearchParams(params)}`),
    recent: () => request<any[]>('/scans/recent'),
    get: (id: string) => request<any>(`/scans/${id}`),
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
    list: () => request<any[]>('/reports'),
    generate: (data?: any) =>
      request<any>('/reports/generate', { method: 'POST', body: JSON.stringify(data || {}) }),
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
  timesheets: {
    list: (params?: Record<string, string>) =>
      request<any[]>(`/timesheets?${new URLSearchParams(params)}`),
    summary: () => request<any>('/timesheets/summary'),
  },
}
