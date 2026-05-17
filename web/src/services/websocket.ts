import { io, Socket } from 'socket.io-client'

const WS_URL = import.meta.env.VITE_WS_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

let socket: Socket | null = null

export function connectSocket(token: string) {
  if (socket?.connected) return socket

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => console.log('[WS] Connected'))
  socket.on('disconnect', (reason) => console.log('[WS] Disconnected:', reason))
  socket.on('connect_error', (err) => console.error('[WS] Error:', err.message))

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function subscribeToScans(callback: (data: any) => void) {
  socket?.on('scan:new', callback)
  return () => {
    socket?.off('scan:new', callback)
  }
}

export function subscribeToAlerts(callback: (data: any) => void) {
  socket?.on('scan:alert', callback)
  return () => {
    socket?.off('scan:alert', callback)
  }
}

export function subscribeToShiftUpdates(callback: (data: any) => void) {
  socket?.on('shift:update', callback)
  return () => {
    socket?.off('shift:update', callback)
  }
}

export function subscribeToIncidents(callback: (data: any) => void) {
  socket?.on('incident:new', callback)
  return () => {
    socket?.off('incident:new', callback)
  }
}
