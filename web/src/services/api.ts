const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('No internet connection. Check your network and try again.')
  }
  const token = localStorage.getItem('patrol_token')
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...headers, ...options?.headers as Record<string, string> },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || 'Request failed')
  }
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
