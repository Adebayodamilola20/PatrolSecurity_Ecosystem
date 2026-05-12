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
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateProfile: (data: Partial<AuthUser>) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    const res = await api.auth.login(email, password)
    const { token, user } = res
    set({ user, token, isAuthenticated: true })
    localStorage.setItem('patrol_token', token)
    connectSocket(token)
  },

  logout: () => {
    disconnectSocket()
    set({ user: null, token: null, isAuthenticated: false })
    localStorage.removeItem('patrol_token')
  },

  updateProfile: (data) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...data } : null,
    }))
  },
}))
