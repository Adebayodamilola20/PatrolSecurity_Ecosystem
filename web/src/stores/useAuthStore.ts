import { create } from 'zustand'
import { api } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/websocket'
import type { Site } from '../types'

export type UserRole = 'admin' | 'main_account' | 'supervisor' | 'guard'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  phone: string
  clientId?: string | null
  clientName?: string | null
  siteIds?: string[]
  sites?: Site[]
  liveTracking?: boolean
}

interface AuthStore {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  hydrate: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateProfile: (data: Partial<AuthUser>) => void
}

function loadFromStorage(): { token: string | null; user: AuthUser | null } {
  const token = localStorage.getItem('patrol_token')
  const raw = localStorage.getItem('patrol_user')
  let user = null
  if (raw) {
    try { user = JSON.parse(raw) } catch { localStorage.removeItem('patrol_user') }
  }
  return { token, user }
}

const saved = loadFromStorage()

if (saved.token) {
  connectSocket(saved.token)
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: saved.user,
  token: saved.token,
  isAuthenticated: false,
  loading: !!saved.token,

  hydrate: async () => {
    const token = localStorage.getItem('patrol_token')
    const rawUser = localStorage.getItem('patrol_user')
    if (!token || !rawUser) {
      disconnectSocket()
      set({ user: null, token: null, isAuthenticated: false, loading: false })
      return
    }

    set({ loading: true })
    try {
      const res = await api.auth.me()
      localStorage.setItem('patrol_user', JSON.stringify(res.user))
      connectSocket(token)
      set({ user: res.user, token, isAuthenticated: true, loading: false })
    } catch {
      disconnectSocket()
      localStorage.removeItem('patrol_token')
      localStorage.removeItem('patrol_user')
      set({ user: null, token: null, isAuthenticated: false, loading: false })
    }
  },

  login: async (email: string, password: string) => {
    const res = await api.auth.login(email, password)
    const { token, user } = res
    set({ user, token, isAuthenticated: true, loading: false })
    localStorage.setItem('patrol_token', token)
    localStorage.setItem('patrol_user', JSON.stringify(user))
    connectSocket(token)
  },

  logout: () => {
    disconnectSocket()
    set({ user: null, token: null, isAuthenticated: false, loading: false })
    localStorage.removeItem('patrol_token')
    localStorage.removeItem('patrol_user')
  },

  updateProfile: (data) => {
    set((state) => {
      if (!state.user) return state
      const updated = { ...state.user, ...data }
      localStorage.setItem('patrol_user', JSON.stringify(updated))
      return { user: updated }
    })
  },
}))

export function useIsAdmin() {
  return useAuthStore((s) => s.user?.role?.trim()?.toLowerCase() === 'admin')
}

export function useIsMainAccount() {
  const role = useAuthStore((s) => s.user?.role?.trim()?.toLowerCase()?.replace(/[-_\s]+/g, '_'))
  return role === 'main_account' || role === 'client_main_account'
}

export function useIsSupervisor() {
  return useAuthStore((s) => s.user?.role?.trim()?.toLowerCase() === 'supervisor')
}

export function useIsGuard() {
  const role = useAuthStore((s) => s.user?.role?.trim()?.toLowerCase())
  return role === 'guard' || role === 'officer'
}

export function useCanManageUsers() {
  const role = useAuthStore((s) => s.user?.role?.trim()?.toLowerCase())
  return role === 'admin'
}

export function useCanManageCheckpoints() {
  const role = useAuthStore((s) => s.user?.role?.trim()?.toLowerCase()?.replace(/[-_\s]+/g, '_'))
  return role === 'admin' || role === 'main_account' || role === 'client_main_account'
}

export function useCanViewAlerts() {
  const role = useAuthStore((s) => s.user?.role?.trim()?.toLowerCase())
  return role !== 'guard' && role !== 'officer'
}

export function useCanViewLiveTracking() {
  const user = useAuthStore((s) => s.user)
  if (!user) return false
  const role = user.role?.trim()?.toLowerCase()
  if (role === 'admin' || role === 'main_account' || role === 'supervisor') return true
  if (!user.liveTracking) return false
  return false
}
