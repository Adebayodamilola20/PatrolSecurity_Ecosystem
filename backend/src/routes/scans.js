import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

function createIncident(officerId, checkpointId, title, description, severity, app) {
  const incident = {
    id: uuidv4(),
    officerId, checkpointId: checkpointId || null,
    title, description: description || '',
    severity, status: 'open',
  }
  db.prepare(`
    INSERT INTO incidents (id, officerId, checkpointId, title, description, severity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(...Object.values(incident))
  const full = db.prepare(`
    SELECT i.*, u.name as officerName FROM incidents i JOIN users u ON i.officerId = u.id WHERE i.id = ?
  `).get(incident.id)
  if (app?.get('io')) app.get('io').emit('incident:new', full)
}

const router = Router()

router.use(authMiddleware)

router.get('/', (req, res) => {
  const { limit = 100, offset = 0, officer, checkpoint } = req.query
  let query = `
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
  `
  const conditions = []
  const params = []
  if (officer) {
    conditions.push('s.officerId = ?')
    params.push(officer)
  }
  if (checkpoint) {
    conditions.push('s.checkpointId = ?')
    params.push(checkpoint)
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY s.receivedAt DESC LIMIT ? OFFSET ?'
  params.push(Number(limit), Number(offset))

    const scans = db.prepare(query).all(...params)
  res.json(scans.map(s => ({ ...s, gpsValid: !!s.gpsValid })))
})

router.get('/recent', (req, res) => {
  const scans = db.prepare(`
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
    ORDER BY s.receivedAt DESC LIMIT 20
  `).all()
  res.json(scans.map(s => ({ ...s, gpsValid: !!s.gpsValid })))
})

router.get('/:id', (req, res) => {
  const scan = db.prepare(`
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
    WHERE s.id = ?
  `).get(req.params.id)

  if (!scan) return res.status(404).json({ message: 'Scan not found' })
  res.json({ ...scan, gpsValid: !!scan.gpsValid })
})

router.post('/', (req, res) => {
  const { checkpointId, gpsLatitude, gpsLongitude, notes } = req.body

  if (!checkpointId) {
    return res.status(400).json({ message: 'checkpointId is required' })
  }

  const checkpoint = db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(checkpointId)
  if (!checkpoint) {
    return res.status(404).json({ message: 'Checkpoint not found' })
  }

  let distanceMeters = null
  let gpsValid = true
  if (gpsLatitude != null && gpsLongitude != null) {
    const R = 6371000
    const dLat = (gpsLatitude - checkpoint.latitude) * Math.PI / 180
    const dLon = (gpsLongitude - checkpoint.longitude) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(checkpoint.latitude * Math.PI / 180) *
              Math.cos(gpsLatitude * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    distanceMeters = Math.round(R * c)
    gpsValid = distanceMeters <= (checkpoint.radiusMeters || 50)
    if (!gpsValid) {
      createIncident(
        req.user.id, checkpointId,
        'Geofence Breach',
        `Guard scanned ${checkpoint.name} from ${distanceMeters}m away (radius: ${checkpoint.radiusMeters}m)`,
        'high',
        req.app,
      )
    }
  }

  const scan = {
    id: uuidv4(),
    officerId: req.user.id,
    checkpointId,
    scannedAt: new Date().toISOString(),
    gpsLatitude: gpsLatitude || null,
    gpsLongitude: gpsLongitude || null,
    gpsValid: gpsValid ? 1 : 0,
    distanceMeters,
    notes: notes || '',
  }

  db.prepare(`
    INSERT INTO scans (id, officerId, checkpointId, scannedAt, gpsLatitude, gpsLongitude, gpsValid, distanceMeters, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...Object.values(scan))

  const fullScan = db.prepare(`
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
    WHERE s.id = ?
  `).get(scan.id)

  const scanResult = { ...fullScan, gpsValid: !!fullScan.gpsValid }

  if (req.app.get('io')) {
    req.app.get('io').emit('scan:new', scanResult)
  }

  res.status(201).json(scanResult)
})

export default router
