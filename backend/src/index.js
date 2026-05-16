import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import path from 'path'
import { fileURLToPath } from 'url'

import authRoutes from './routes/auth.js'
import scanRoutes from './routes/scans.js'
import checkpointRoutes from './routes/checkpoints.js'
import reportRoutes from './routes/reports.js'
import userRoutes from './routes/users.js'
import shiftRoutes from './routes/shifts.js'
import incidentRoutes from './routes/incidents.js'
import timesheetRoutes from './routes/timesheets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const server = createServer(app)

const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173',
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:5173$/,
  /^http:\/\/172\.\d{1,3}\.\d{1,3}\.\d{1,3}:5173$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:5173$/,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
  ...(process.env.VERCEL_URL ? [new RegExp(`https://${process.env.VERCEL_URL.replace(/\./g, '\\.')}`), `https://${process.env.VERCEL_URL}`] : []),
]

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
})

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('Authentication required'))

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'patrol-monitoring-secret-key-2024')
    socket.user = decoded
    next()
  } catch {
    next(new Error('Invalid token'))
  }
})

io.on('connection', (socket) => {
  console.log(`[WS] User connected: ${socket.user?.name} (${socket.user?.role})`)
  socket.join(socket.user?.role === 'admin' ? 'admin-room' : 'officer-room')

  socket.on('disconnect', () => {
    console.log(`[WS] User disconnected: ${socket.user?.name}`)
  })
})

app.set('io', io)
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/scans', scanRoutes)
app.use('/api/v1/checkpoints', checkpointRoutes)
app.use('/api/v1/reports', reportRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/shifts', shiftRoutes)
app.use('/api/v1/incidents', incidentRoutes)
app.use('/api/v1/timesheets', timesheetRoutes)

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
