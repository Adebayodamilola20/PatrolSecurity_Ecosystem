import { create } from 'zustand'
import { api, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_STORAGE_KEY } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/websocket'
import { IDLE_ACTIVITY_KEY } from '../hooks/useIdleLogout'
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

// Client accounts (main_account) have been moved off the staff web dashboard.
// This guards against a client whose token is still valid (issued before the
// change) from lingering in the staff app on reload.
function isClientRole(role?: string | null): boolean {
  return (role ?? '').trim().toLowerCase().replace(/[-_\s]+/g, '_') === 'main_account'
}

function loadFromStorage(): { token: string | null; user: AuthUser | null } {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  const raw = localStorage.getItem(USER_STORAGE_KEY)
  let user = null
  if (raw) {
    try { user = JSON.parse(raw) } catch { localStorage.removeItem(USER_STORAGE_KEY) }
  }
  return { token, user }
}

function clearSession() {
  disconnectSocket()
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
  // Drop the idle stamp too: leaving a stale one behind would make the next
  // sign-in look like it had already been idle for hours.
  localStorage.removeItem(IDLE_ACTIVITY_KEY)
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
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    const rawUser = localStorage.getItem(USER_STORAGE_KEY)
    if (!token || !rawUser) {
      clearSession()
      set({ user: null, token: null, isAuthenticated: false, loading: false })
      return
    }

    set({ loading: true })
    try {
      // api.auth.me() silently refreshes the access token on 401. If the refresh
      // window (1h idle / 24h absolute) has passed it throws, and we log out.
      const res = await api.auth.me()
      if (isClientRole(res.user?.role)) {
        clearSession()
        set({ user: null, token: null, isAuthenticated: false, loading: false })
        return
      }
      // The token may have been rotated during me(); re-read the current one.
      const currentToken = localStorage.getItem(ACCESS_TOKEN_KEY) || token
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user))
      connectSocket(currentToken)
      set({ user: res.user, token: currentToken, isAuthenticated: true, loading: false })
    } catch {
      clearSession()
      set({ user: null, token: null, isAuthenticated: false, loading: false })
    }
  },

  login: async (email: string, password: string) => {
    const res = await api.auth.login(email, password)
    const { token, refreshToken, user } = res
    if (isClientRole(user?.role)) {
      throw new Error('Client accounts no longer have access to the staff dashboard.')
    }
    set({ user, token, isAuthenticated: true, loading: false })
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
    connectSocket(token)
  },

  logout: () => {
    // Revoke the session server-side (kills the refresh-token family), then
    // clear locally regardless — logout must always succeed for the user.
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (refreshToken) void api.auth.logout(refreshToken).catch(() => {})
    clearSession()
    set({ user: null, token: null, isAuthenticated: false, loading: false })
  },

  updateProfile: (data) => {
    set((state) => {
      if (!state.user) return state
      const updated = { ...state.user, ...data }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated))
      return { user: updated }
    })
  },
}))

// When a request's silent refresh fails (idle >1h or session >24h), api.ts emits
// 'app:session-expired'. Tear the session down so the app routes back to login and
// the guard must re-enter their email + password.
if (typeof window !== 'undefined') {
  window.addEventListener('app:session-expired', () => {
    clearSession()
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, loading: false })
  })
}

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
