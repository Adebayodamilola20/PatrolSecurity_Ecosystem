import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.get('/', (req, res) => {
  const checkpoints = db.prepare('SELECT * FROM checkpoints ORDER BY name').all()
  res.json(checkpoints.map(c => ({ ...c, active: !!c.active })))
})

router.get('/:id', (req, res) => {
  const cp = db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(req.params.id)
  if (!cp) return res.status(404).json({ message: 'Checkpoint not found' })
  res.json({ ...cp, active: !!cp.active })
})

router.post('/', adminOnly, (req, res) => {
  const { name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes } = req.body
  if (!name || !code || latitude == null || longitude == null) {
    return res.status(400).json({ message: 'name, code, latitude, longitude are required' })
  }

  const existing = db.prepare('SELECT id FROM checkpoints WHERE code = ?').get(code)
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
    active: 1,
  }

  db.prepare(`
    INSERT INTO checkpoints (id, name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...Object.values(cp))

  res.status(201).json({ ...cp, active: !!cp.active })
})

router.put('/:id', adminOnly, (req, res) => {
  const existing = db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ message: 'Checkpoint not found' })

  const { name, code, latitude, longitude, radiusMeters, expectedIntervalMinutes, active } = req.body
  db.prepare(`
    UPDATE checkpoints SET name=?, code=?, latitude=?, longitude=?, radiusMeters=?, expectedIntervalMinutes=?, active=?
    WHERE id=?
  `).run(
    name ?? existing.name,
    code?.toUpperCase() ?? existing.code,
    latitude ?? existing.latitude,
    longitude ?? existing.longitude,
    radiusMeters ?? existing.radiusMeters,
    expectedIntervalMinutes ?? existing.expectedIntervalMinutes,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  )

  const updated = db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(req.params.id)
  res.json({ ...updated, active: !!updated.active })
})

router.delete('/:id', adminOnly, (req, res) => {
  const result = db.prepare('DELETE FROM checkpoints WHERE id = ?').run(req.params.id)
  if (result.changes === 0) return res.status(404).json({ message: 'Checkpoint not found' })
  res.json({ message: 'Deleted' })
})

export default router
