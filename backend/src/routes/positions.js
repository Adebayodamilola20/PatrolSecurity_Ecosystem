import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.post('/', async (req, res) => {
  const { latitude, longitude, accuracy, speed, heading, capturedAt } = req.body

  if (latitude == null || longitude == null) {
    return res.status(400).json({ message: 'latitude and longitude are required' })
  }

  const record = {
    id: uuidv4(),
    userId: req.user.id,
    latitude,
    longitude,
    accuracy: accuracy ?? null,
    speed: speed ?? null,
    heading: heading ?? null,
    capturedAt: capturedAt || new Date().toISOString(),
  }

  await db.run(`
    INSERT INTO officerPositions (id, userId, latitude, longitude, accuracy, speed, heading, capturedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(record))

  if (req.app.get('io')) {
    req.app.get('io').emit('position:update', {
      userId: req.user.id,
      name: req.user.name,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      capturedAt: record.capturedAt,
      onDuty: true,
    })
  }

  res.status(201).json({ status: 'ok' })
})

export default router
