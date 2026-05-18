import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.post('/clock-in', async (req, res) => {
  const activeShift = await db.get(
    "SELECT id FROM shifts WHERE userId = ? AND status = 'active'"
  , [req.user.id])

  if (activeShift) {
    return res.status(409).json({ message: 'Already clocked in' })
  }

  const now = new Date()
  const scheduledStart = req.body?.scheduledStart || now.toISOString()
  const scheduledEnd = req.body?.scheduledEnd || new Date(now.getTime() + 8 * 3600000).toISOString()
  let siteLabel = req.body?.siteLabel || ''
  if (!siteLabel) {
    const assignedOrder = await db.get(`
      SELECT po.id, c.name as checkpointName
      FROM postOrders po
      LEFT JOIN checkpoints c ON po.checkpointId = c.id
      WHERE po.active = 1
        AND (po.assignedUserId IS NULL OR po.assignedUserId = ?)
        AND (po.assignedRole IS NULL OR po.assignedRole = ?)
      ORDER BY po.createdAt DESC
      LIMIT 1
    `, [req.user.id, req.user.role])
    siteLabel = assignedOrder?.checkpointName || ''
  }

  const shift = {
    id: uuidv4(),
    userId: req.user.id,
    clockIn: now.toISOString(),
    clockOut: null,
    status: 'active',
    clockInPhoto: '',
    clockInLatitude: null,
    clockInLongitude: null,
    clockOutLatitude: null,
    clockOutLongitude: null,
    scheduledStart,
    scheduledEnd,
    siteLabel,
  }

  await db.run(`
    INSERT INTO shifts (id, userId, clockIn, clockOut, status, clockInPhoto,
      clockInLatitude, clockInLongitude, clockOutLatitude, clockOutLongitude,
      scheduledStart, scheduledEnd, siteLabel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(shift))

  if (req.app.get('io')) {
    req.app.get('io').emit('shift:update', { userId: req.user.id, status: 'active' })
  }

  res.status(201).json(shift)
})

router.post('/clock-out', async (req, res) => {
  const activeShift = await db.get(
    "SELECT * FROM shifts WHERE userId = ? AND status = 'active'"
  , [req.user.id])

  if (!activeShift) {
    return res.status(404).json({ message: 'No active shift' })
  }

  const clockOut = new Date().toISOString()
  await db.run(
    "UPDATE shifts SET clockOut = ?, status = 'completed' WHERE id = ?"
  , [clockOut, activeShift.id])

  if (req.app.get('io')) {
    req.app.get('io').emit('shift:update', { userId: req.user.id, status: 'completed' })
  }

  res.json({ ...activeShift, clockOut, status: 'completed' })
})

router.get('/status', async (req, res) => {
  const activeShift = await db.get(
    "SELECT * FROM shifts WHERE userId = ? AND status = 'active'"
  , [req.user.id])

  res.json({
    active: !!activeShift,
    shift: activeShift || null,
  })
})

router.get('/', async (req, res) => {
  const shifts = await db.all(`
    SELECT s.*, u.name as userName, u.email as userEmail
    FROM shifts s
    JOIN users u ON s.userId = u.id
    ORDER BY s.createdAt DESC LIMIT 50
  `)
  res.json(shifts)
})

router.get('/missing-clockins', async (req, res) => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  const activeUsers = await db.all(
    "SELECT id, name FROM users WHERE active = 1 AND role IN ('officer', 'supervisor')"
  )

  const todaysShifts = await db.all(`
    SELECT DISTINCT userId FROM shifts WHERE clockIn >= ?
  `, [todayStart])

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
    const existing = await db.get(
      "SELECT id FROM incidents WHERE title = 'Missing Clock-In' AND description LIKE ? AND status = 'open'"
    , [`%${m.userName}%`])
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
      await db.run(`
        INSERT INTO incidents (id, officerId, checkpointId, title, description, severity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, Object.values(incident))
      const full = await db.get(`
        SELECT i.*, u.name as officerName FROM incidents i JOIN users u ON i.officerId = u.id WHERE i.id = ?
      `, [incident.id])
      if (req.app?.get('io')) req.app.get('io').emit('incident:new', full)
    }
  }

  res.json(missing)
})

export default router
