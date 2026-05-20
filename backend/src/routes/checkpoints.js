import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly, adminOrMainAccountOnly } from '../middleware/auth.js'
import { normalizeRole } from '../utils/roles.js'

const router = Router()
const PATROL_INTERVAL_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60]

router.use(authMiddleware)

function normalizeCheckpoint(cp) {
  if (!cp) return cp
  return {
    id: cp.id,
    name: cp.name,
    code: cp.code,
    latitude: cp.latitude,
    longitude: cp.longitude,
    radiusMeters: cp.radiusMeters ?? cp.radiusmeters ?? 50,
    expectedIntervalMinutes: cp.expectedIntervalMinutes ?? cp.expectedintervalminutes ?? 30,
    scheduledTimeIn: cp.scheduledTimeIn ?? cp.scheduledtimein ?? '',
    scheduledTimeOut: cp.scheduledTimeOut ?? cp.scheduledtimeout ?? '',
    active: !!(cp.active ?? cp.active === 1),
    clientId: cp.clientId ?? cp.clientid ?? null,
    siteId: cp.siteId ?? cp.siteid ?? null,
    createdAt: cp.createdAt ?? cp.createdat ?? null,
    lastScan: cp.lastScan ?? cp.lastscan ?? null,
  }
}

function normalizePatrolInterval(value, fallback = 30) {
  const interval = Number(value ?? fallback)
  if (!PATROL_INTERVAL_OPTIONS.includes(interval)) {
    return null
  }
  return interval
}

router.get('/', async (req, res) => {
  const role = normalizeRole(req.user?.role)
  let query = 'SELECT * FROM checkpoints'
  const conditions = []
  const params = []

  if (role === 'main_account') {
    conditions.push('clientId = ?')
    params.push(req.user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    conditions.push(`(
      siteId IN (SELECT siteId FROM user_site_assignments WHERE userId = ?)
      OR id IN (SELECT DISTINCT checkpointId FROM scans WHERE officerId = ?)
    )`)
    params.push(req.user.id, req.user.id)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY name'

  const checkpoints = await db.all(query, params)
  res.json(checkpoints.map(normalizeCheckpoint))
})

router.get('/:id', async (req, res) => {
  const cp = await db.get('SELECT * FROM checkpoints WHERE id = ?', [req.params.id])
  if (!cp) return res.status(404).json({ message: 'Checkpoint not found' })

  const role = normalizeRole(req.user?.role)
  if (role === 'main_account' && cp.clientId !== req.user.clientId) {
    return res.status(403).json({ message: 'Access denied' })
  }
  if (role === 'supervisor' || role === 'guard') {
    const assigned = await db.get(
      'SELECT 1 FROM user_site_assignments WHERE userId = ? AND siteId = ?',
      [req.user.id, cp.siteId]
    )
    if (!assigned) {
      return res.status(403).json({ message: 'Access denied' })
    }
  }

  res.json(normalizeCheckpoint(cp))
})

router.post('/', adminOrMainAccountOnly, async (req, res) => {
  const { name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes, scheduledTimeIn, scheduledTimeOut, siteId } = req.body
  if (!name || !code || latitude == null || longitude == null) {
    return res.status(400).json({ message: 'name, code, latitude, longitude are required' })
  }

  const interval = normalizePatrolInterval(expectedIntervalMinutes)
  if (interval == null) {
    return res.status(400).json({
      message: `expectedIntervalMinutes must be one of: ${PATROL_INTERVAL_OPTIONS.join(', ')}`,
      allowedIntervals: PATROL_INTERVAL_OPTIONS,
    })
  }

  const existing = await db.get('SELECT id FROM checkpoints WHERE code = ?', [code])
  if (existing) {
    return res.status(409).json({ message: 'Checkpoint code already exists' })
  }

  const cp = {
    id: uuidv4(),
    name,
    code: code.toUpperCase(),
    latitude,
    longitude,
    radiusMeters: radiusMeters || 50,
    expectedIntervalMinutes: interval,
    scheduledTimeIn: scheduledTimeIn || '',
    scheduledTimeOut: scheduledTimeOut || '',
    clientId: req.user.clientId || null,
    siteId: siteId || null,
    active: 1,
  }

  await db.run(`
    INSERT INTO checkpoints (id, name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes, scheduledTimeIn, scheduledTimeOut, clientId, siteId, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(cp))

  res.status(201).json({ ...cp, active: !!cp.active })
})

router.put('/:id', adminOrMainAccountOnly, async (req, res) => {
  const existingRaw = await db.get('SELECT * FROM checkpoints WHERE id = ?', [req.params.id])
  if (!existingRaw) return res.status(404).json({ message: 'Checkpoint not found' })
  const existing = normalizeCheckpoint(existingRaw)

  const role = normalizeRole(req.user?.role)
  if (role === 'main_account' && existing.clientId !== req.user.clientId) {
    return res.status(403).json({ message: 'Access denied' })
  }

  const { name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes, scheduledTimeIn, scheduledTimeOut, siteId, active } = req.body
  const interval = expectedIntervalMinutes === undefined
    ? existing.expectedIntervalMinutes
    : normalizePatrolInterval(expectedIntervalMinutes, existing.expectedIntervalMinutes)
  if (interval == null) {
    return res.status(400).json({
      message: `expectedIntervalMinutes must be one of: ${PATROL_INTERVAL_OPTIONS.join(', ')}`,
      allowedIntervals: PATROL_INTERVAL_OPTIONS,
    })
  }

  await db.run(`
    UPDATE checkpoints SET name=?, code=?, latitude=?, longitude=?, radiusMeters=?, expectedIntervalMinutes=?, scheduledTimeIn=?, scheduledTimeOut=?, siteId=?, active=?
    WHERE id=?
  `, [
    name ?? existing.name,
    code?.toUpperCase() ?? existing.code,
    latitude ?? existing.latitude,
    longitude ?? existing.longitude,
    radiusMeters ?? existing.radiusMeters,
    interval,
    scheduledTimeIn ?? existing.scheduledTimeIn ?? '',
    scheduledTimeOut ?? existing.scheduledTimeOut ?? '',
    siteId ?? existing.siteId,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  ])

  const updated = await db.get('SELECT * FROM checkpoints WHERE id = ?', [req.params.id])
  res.json(normalizeCheckpoint(updated))
})

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const existing = await db.get('SELECT id FROM checkpoints WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ message: 'Checkpoint not found' })

    await db.run('UPDATE incidents SET checkpointId = NULL WHERE checkpointId = ?', [req.params.id])
    await db.run('DELETE FROM scans WHERE checkpointId = ?', [req.params.id])
    const result = await db.run('DELETE FROM checkpoints WHERE id = ?', [req.params.id])

    if (result.changes === 0) return res.status(404).json({ message: 'Checkpoint not found' })
    res.json({ message: 'Deleted' })
  } catch (err) {
    if (err.code === '23503' || (err.message && err.message.includes('foreign key constraint'))) {
      return res.status(409).json({
        message: 'Cannot delete: this checkpoint has linked incidents, scans, or shifts. Remove or reassign them first.'
      })
    }
    res.status(500).json({ message: 'Failed to delete checkpoint' })
  }
})

export default router
