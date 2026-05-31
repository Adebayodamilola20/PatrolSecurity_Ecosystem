import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { normalizeRole, buildUserScopeFilter } from '../utils/roles.js'

const router = Router()

router.use(authMiddleware)

function normalizeUser(user) {
  if (!user) return user
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? '',
    active: !!(user.active ?? user.active === 1),
    clientId: user.clientId ?? null,
    liveTracking: !!(user.liveTracking ?? user.livetracking ?? 1),
    createdAt: user.createdAt ?? user.createdat ?? null,
    onDuty: !!(user.onDuty ?? user.onduty),
    lastClockIn: user.lastClockIn ?? user.lastclockin ?? null,
    lastClockOut: user.lastClockOut ?? user.lastclockout ?? null,
  }
}

function normalizeShift(shift) {
  if (!shift) return shift
  return {
    id: shift.id,
    clockIn: shift.clockIn ?? shift.clockin ?? null,
    clockOut: shift.clockOut ?? shift.clockout ?? null,
    status: shift.status,
    createdAt: shift.createdAt ?? shift.createdat ?? null,
    scheduledStart: shift.scheduledStart ?? shift.scheduledstart ?? null,
    scheduledEnd: shift.scheduledEnd ?? shift.scheduledend ?? null,
  }
}

function normalizeScan(scan) {
  if (!scan) return scan
  return {
    id: scan.id,
    checkpointId: scan.checkpointId ?? scan.checkpointid ?? '',
    checkpointName: scan.checkpointName ?? scan.checkpointname ?? '',
    checkpointCode: scan.checkpointCode ?? scan.checkpointcode ?? '',
    scannedAt: scan.scannedAt ?? scan.scannedat ?? null,
    receivedAt: scan.receivedAt ?? scan.receivedat ?? null,
    gpsLatitude: scan.gpsLatitude ?? scan.gpslatitude ?? null,
    gpsLongitude: scan.gpsLongitude ?? scan.gpslongitude ?? null,
    gpsValid: !!(scan.gpsValid ?? scan.gpsvalid),
    distanceMeters: scan.distanceMeters ?? scan.distancemeters ?? null,
    notes: scan.notes ?? '',
  }
}

router.get('/', async (req, res) => {
  const scope = buildUserScopeFilter(req.user, { userPrefix: 'u' })
  const query = `
    SELECT
      u.id, u.name, u.email, u.role, u.phone, u.active, u.createdAt, u.clientId,
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
    ${scope.conditions.length > 0 ? 'WHERE ' + scope.conditions.join(' AND ') : ''}
    ORDER BY u.createdAt DESC
  `
  const users = await db.all(query, scope.params)
  res.json(users.map(normalizeUser))
})

router.get('/:id', async (req, res) => {
  const user = await db.get(`
    SELECT
      u.id, u.name, u.email, u.role, u.phone, u.active, u.createdAt, u.clientId,
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

  const role = normalizeRole(req.user?.role)
  if (role === 'main_account' && user.clientId !== req.user.clientId) {
    return res.status(403).json({ message: 'Access denied' })
  }
  if ((role === 'supervisor' || role === 'guard') && user.id !== req.user.id) {
    return res.status(403).json({ message: 'Access denied' })
  }

  const [shifts, scans] = await Promise.all([
    db.all(`
      SELECT id, clockIn, clockOut, status, createdAt, scheduledStart, scheduledEnd
      FROM shifts
      WHERE userId = ?
      ORDER BY createdAt DESC
      LIMIT 20
    `, [req.params.id]),
    db.all(`
      SELECT s.*, c.name as checkpointName, c.code as checkpointCode, c.active as checkpointActive
      FROM scans s
      JOIN checkpoints c ON s.checkpointId = c.id
      WHERE s.officerId = ?
      ORDER BY s.receivedAt DESC
      LIMIT 20
    `, [req.params.id]),
  ])

  res.json({
    ...normalizeUser(user),
    shifts: shifts.map(normalizeShift),
    scans: scans.map(normalizeScan),
  })
})

router.post('/', adminOnly, async (req, res) => {
  const { name, email, password, role, phone, clientId, siteIds } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, password are required' })
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email])
  if (existing) {
    return res.status(409).json({ message: 'Email already in use' })
  }

  const validRoles = ['admin', 'main_account', 'supervisor', 'guard']
  const normalizedRole = normalizeRole(role)
  const userRole = validRoles.includes(normalizedRole) ? normalizedRole : 'guard'

  const hashed = bcrypt.hashSync(password, 10)
  const user = {
    id: uuidv4(),
    name,
    email,
    password: hashed,
    role: userRole,
    phone: phone || '',
    active: 1,
    clientId: clientId || null,
  }

  await db.run(`
    INSERT INTO users (id, name, email, password, role, phone, active, clientId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(user))

  if (siteIds && Array.isArray(siteIds) && siteIds.length > 0) {
    for (const siteId of siteIds) {
      const existingAssignment = await db.get(
        'SELECT id FROM user_site_assignments WHERE userId = ? AND siteId = ?',
        [user.id, siteId]
      )
      if (!existingAssignment) {
        await db.run(
          'INSERT INTO user_site_assignments (id, userId, siteId) VALUES (?, ?, ?)',
          [uuidv4(), user.id, siteId]
        )
      }
    }
  }

  const { password: _, ...safeUser } = user
  res.status(201).json({ ...safeUser, active: !!safeUser.active })
})

export default router
