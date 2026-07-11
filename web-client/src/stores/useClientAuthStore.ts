import { create } from 'zustand'
import { api, TOKEN_KEY, REFRESH_KEY, USER_KEY } from '../services/api'
import type { ClientUser } from '../types'

// Normalizes role strings like "Main-Account" / "client_main_account" -> "main_account".
function normalizeRole(role?: string | null): string {
  return (role ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_')
}

// The client portal is ONLY for client (main_account) accounts. Any other role
// (admin/supervisor/guard) belongs to the staff dashboard or mobile app and must
// be rejected here even if it presents a valid token.
export function isClientAccount(role?: string | null): boolean {
  const r = normalizeRole(role)
  return r === 'main_account' || r === 'client_main_account'
}

interface ClientAuthStore {
  user: ClientUser | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  hydrate: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

function loadFromStorage(): { token: string | null; user: ClientUser | null } {
  const token = localStorage.getItem(TOKEN_KEY)
  const raw = localStorage.getItem(USER_KEY)
  let user: ClientUser | null = null
  if (raw) {
    try {
      user = JSON.parse(raw)
    } catch {
      localStorage.removeItem(USER_KEY)
    }
  }
  return { token, user }
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

const saved = loadFromStorage()

export const useClientAuthStore = create<ClientAuthStore>((set) => ({
  user: saved.user,
  token: saved.token,
  isAuthenticated: false,
  loading: !!saved.token,

  hydrate: async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    const rawUser = localStorage.getItem(USER_KEY)
    if (!token || !rawUser) {
      set({ user: null, token: null, isAuthenticated: false, loading: false })
      return
    }
    set({ loading: true })
    try {
      // api.auth.me() silently refreshes on 401; if the refresh window (1h idle
      // / 24h absolute) has passed it throws and we fall through to logout.
      const res = await api.auth.me()
      if (!isClientAccount(res.user?.role)) {
        clearSession()
        set({ user: null, token: null, isAuthenticated: false, loading: false })
        return
      }
      // The access token may have rotated during me(); re-read the current one.
      const currentToken = localStorage.getItem(TOKEN_KEY) || token
      localStorage.setItem(USER_KEY, JSON.stringify(res.user))
      set({ user: res.user, token: currentToken, isAuthenticated: true, loading: false })
    } catch {
      clearSession()
      set({ user: null, token: null, isAuthenticated: false, loading: false })
    }
  },

  login: async (email: string, password: string) => {
    const { token, refreshToken, user } = await api.auth.login(email, password)
    if (!isClientAccount(user?.role)) {
      throw new Error('This portal is for client accounts only.')
    }
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(REFRESH_KEY, refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ user, token, isAuthenticated: true, loading: false })
  },

  logout: () => {
    // Revoke the session server-side (kills the refresh-token family), then
    // clear locally regardless — logout must always succeed for the user.
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (refreshToken) void api.auth.logout(refreshToken).catch(() => {})
    clearSession()
    set({ user: null, token: null, isAuthenticated: false, loading: false })
  },
}))

// When a request's silent refresh fails (idle >1h or session >24h old), api.ts
// emits 'client:session-expired'. Tear the session down so the portal routes
// back to login and the client must re-enter their email + password.
if (typeof window !== 'undefined') {
  window.addEventListener('client:session-expired', () => {
    clearSession()
    useClientAuthStore.setState({ user: null, token: null, isAuthenticated: false, loading: false })
  })
}
