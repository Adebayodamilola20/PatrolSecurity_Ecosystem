import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.post('/clock-in', (req, res) => {
  const activeShift = db.prepare(
    "SELECT id FROM shifts WHERE userId = ? AND status = 'active'"
  ).get(req.user.id)

  if (activeShift) {
    return res.status(409).json({ message: 'Already clocked in' })
  }

  const shift = {
    id: uuidv4(),
    userId: req.user.id,
    clockIn: new Date().toISOString(),
    clockOut: null,
    status: 'active',
    clockInPhoto: '',
    clockInLatitude: null,
    clockInLongitude: null,
    clockOutLatitude: null,
    clockOutLongitude: null,
    scheduledStart: null,
    scheduledEnd: null,
  }

  db.prepare(`
    INSERT INTO shifts (id, userId, clockIn, clockOut, status, clockInPhoto,
      clockInLatitude, clockInLongitude, clockOutLatitude, clockOutLongitude,
      scheduledStart, scheduledEnd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...Object.values(shift))

  if (req.app.get('io')) {
    req.app.get('io').emit('shift:update', { userId: req.user.id, status: 'active' })
  }

  res.status(201).json(shift)
})

router.post('/clock-out', (req, res) => {
  const activeShift = db.prepare(
    "SELECT * FROM shifts WHERE userId = ? AND status = 'active'"
  ).get(req.user.id)

  if (!activeShift) {
    return res.status(404).json({ message: 'No active shift' })
  }

  const clockOut = new Date().toISOString()
  db.prepare(
    "UPDATE shifts SET clockOut = ?, status = 'completed' WHERE id = ?"
  ).run(clockOut, activeShift.id)

  if (req.app.get('io')) {
    req.app.get('io').emit('shift:update', { userId: req.user.id, status: 'completed' })
  }

  res.json({ ...activeShift, clockOut, status: 'completed' })
})

router.get('/status', (req, res) => {
  const activeShift = db.prepare(
    "SELECT * FROM shifts WHERE userId = ? AND status = 'active'"
  ).get(req.user.id)

  res.json({
    active: !!activeShift,
    shift: activeShift || null,
  })
})

router.get('/', (req, res) => {
  const shifts = db.prepare(`
    SELECT s.*, u.name as userName, u.email as userEmail
    FROM shifts s
    JOIN users u ON s.userId = u.id
    ORDER BY s.createdAt DESC LIMIT 50
  `).all()
  res.json(shifts)
})

router.get('/missing-clockins', (req, res) => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  const activeUsers = db.prepare(
    "SELECT id, name FROM users WHERE active = 1 AND role IN ('officer', 'supervisor')"
  ).all()

  const todaysShifts = db.prepare(`
    SELECT DISTINCT userId FROM shifts WHERE clockIn >= ?
  `).all(todayStart)

  const clockedInIds = new Set(todaysShifts.map(s => s.userId))
  const missing = activeUsers
    .filter(u => !clockedInIds.has(u.id))
    .map(u => ({
      userId: u.id,
      userName: u.name,
      message: `${u.name} has not clocked in today`,
      detectedAt: now.toISOString(),
    }))

  for (const m of missing) {
    const existing = db.prepare(
      "SELECT id FROM incidents WHERE title = 'Missing Clock-In' AND description LIKE ? AND status = 'open'"
    ).get(`%${m.userName}%`)
    if (!existing) {
      const incident = {
        id: uuidv4(),
        officerId: m.userId,
        checkpointId: null,
        title: 'Missing Clock-In',
        description: `${m.userName} has not clocked in today`,
        severity: 'high',
        status: 'open',
      }
      db.prepare(`
        INSERT INTO incidents (id, officerId, checkpointId, title, description, severity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(...Object.values(incident))
      const full = db.prepare(`
        SELECT i.*, u.name as officerName FROM incidents i JOIN users u ON i.officerId = u.id WHERE i.id = ?
      `).get(incident.id)
      if (req.app?.get('io')) req.app.get('io').emit('incident:new', full)
    }
  }

  res.json(missing)
})

export default router
