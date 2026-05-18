import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
  const checkpoints = await db.all('SELECT * FROM checkpoints ORDER BY name')
  res.json(checkpoints.map(c => ({ ...c, active: !!c.active })))
})

router.get('/:id', async (req, res) => {
  const cp = await db.get('SELECT * FROM checkpoints WHERE id = ?', [req.params.id])
  if (!cp) return res.status(404).json({ message: 'Checkpoint not found' })
  res.json({ ...cp, active: !!cp.active })
})

router.post('/', adminOnly, async (req, res) => {
  const { name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes, scheduledTimeIn, scheduledTimeOut } = req.body
  if (!name || !code || latitude == null || longitude == null) {
    return res.status(400).json({ message: 'name, code, latitude, longitude are required' })
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
    expectedIntervalMinutes: expectedIntervalMinutes || 30,
    scheduledTimeIn: scheduledTimeIn || '',
    scheduledTimeOut: scheduledTimeOut || '',
    active: 1,
  }

  await db.run(`
    INSERT INTO checkpoints (id, name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes, scheduledTimeIn, scheduledTimeOut, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(cp))

  res.status(201).json({ ...cp, active: !!cp.active })
})

router.put('/:id', adminOnly, async (req, res) => {
  const existing = await db.get('SELECT * FROM checkpoints WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'Checkpoint not found' })

  const { name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes, scheduledTimeIn, scheduledTimeOut, active } = req.body
  await db.run(`
    UPDATE checkpoints SET name=?, code=?, latitude=?, longitude=?, radiusMeters=?, expectedIntervalMinutes=?, scheduledTimeIn=?, scheduledTimeOut=?, active=?
    WHERE id=?
  `, [
    name ?? existing.name,
    code?.toUpperCase() ?? existing.code,
    latitude ?? existing.latitude,
    longitude ?? existing.longitude,
    radiusMeters ?? existing.radiusMeters,
    expectedIntervalMinutes ?? existing.expectedIntervalMinutes,
    scheduledTimeIn ?? existing.scheduledTimeIn ?? '',
    scheduledTimeOut ?? existing.scheduledTimeOut ?? '',
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  ])

  const updated = await db.get('SELECT * FROM checkpoints WHERE id = ?', [req.params.id])
  res.json({ ...updated, active: !!updated.active })
})

router.delete('/:id', adminOnly, async (req, res) => {
  const result = await db.run('DELETE FROM checkpoints WHERE id = ?', [req.params.id])
  if (result.changes === 0) return res.status(404).json({ message: 'Checkpoint not found' })
  res.json({ message: 'Deleted' })
})

export default router
