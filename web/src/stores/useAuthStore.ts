import { create } from 'zustand'
import { api } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/websocket'

interface AuthUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'supervisor' | 'officer'
  phone: string
}

interface AuthStore {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
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
  isAuthenticated: !!saved.token && !!saved.user,
  loading: false,

  login: async (email: string, password: string) => {
    const res = await api.auth.login(email, password)
    const { token, user } = res
    set({ user, token, isAuthenticated: true })
    localStorage.setItem('patrol_token', token)
    localStorage.setItem('patrol_user', JSON.stringify(user))
    connectSocket(token)
  },

  logout: () => {
    disconnectSocket()
    set({ user: null, token: null, isAuthenticated: false })
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
