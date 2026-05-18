import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
  const users = await db.all(`
    SELECT
      u.id, u.name, u.email, u.role, u.phone, u.active, u.createdAt,
      EXISTS(
        SELECT 1 FROM shifts s
        WHERE s.userId = u.id AND s.status = 'active'
      ) as onDuty,
      (
        SELECT s.clockIn FROM shifts s
        WHERE s.userId = u.id
        ORDER BY s.createdAt DESC
        LIMIT 1
      ) as lastClockIn,
      (
        SELECT s.clockOut FROM shifts s
        WHERE s.userId = u.id
        ORDER BY s.createdAt DESC
        LIMIT 1
      ) as lastClockOut
    FROM users u
    ORDER BY u.createdAt DESC
  `)
  res.json(users.map(u => ({
    ...u,
    active: !!u.active,
    onDuty: !!u.onDuty,
  })))
})

router.get('/:id', async (req, res) => {
  const user = await db.get(`
    SELECT
      u.id, u.name, u.email, u.role, u.phone, u.active, u.createdAt,
      EXISTS(
        SELECT 1 FROM shifts s
        WHERE s.userId = u.id AND s.status = 'active'
      ) as onDuty,
      (
        SELECT s.clockIn FROM shifts s
        WHERE s.userId = u.id
        ORDER BY s.createdAt DESC
        LIMIT 1
      ) as lastClockIn,
      (
        SELECT s.clockOut FROM shifts s
        WHERE s.userId = u.id
        ORDER BY s.createdAt DESC
        LIMIT 1
      ) as lastClockOut
    FROM users u
    WHERE u.id = ?
  `, [req.params.id])

  if (!user) return res.status(404).json({ message: 'User not found' })

  const shifts = await db.all(`
    SELECT id, clockIn, clockOut, status, createdAt, scheduledStart, scheduledEnd
    FROM shifts
    WHERE userId = ?
    ORDER BY createdAt DESC
    LIMIT 20
  `, [req.params.id])

  const scans = await db.all(`
    SELECT s.*, c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN checkpoints c ON s.checkpointId = c.id
    WHERE s.officerId = ?
    ORDER BY s.receivedAt DESC
    LIMIT 20
  `, [req.params.id])

  res.json({
    ...user,
    active: !!user.active,
    onDuty: !!user.onDuty,
    shifts,
    scans,
  })
})

router.post('/', adminOnly, async (req, res) => {
  const { name, email, password, role, phone } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, password are required' })
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email])
  if (existing) {
    return res.status(409).json({ message: 'Email already in use' })
  }

  const validRoles = ['admin', 'supervisor', 'officer']
  const userRole = validRoles.includes(role) ? role : 'officer'

  const hashed = bcrypt.hashSync(password, 10)
  const user = {
    id: uuidv4(),
    name,
    email,
    password: hashed,
    role: userRole,
    phone: phone || '',
    active: 1,
  }

  await db.run(`
    INSERT INTO users (id, name, email, password, role, phone, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, Object.values(user))

  const { password: _, ...safeUser } = user
  res.status(201).json({ ...safeUser, active: !!safeUser.active })
})

export default router
