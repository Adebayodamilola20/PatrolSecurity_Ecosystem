import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

function normalizeScan(scan) {
  if (!scan) return scan

  const normalized = {
    id: scan.id,
    officerId: scan.officerId ?? scan.officerid ?? '',
    officerName: scan.officerName ?? scan.officername ?? '',
    officerPhone: scan.officerPhone ?? scan.officerphone ?? '',
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

  return normalized
}

async function createIncident(officerId, checkpointId, title, description, severity, app) {
  const incident = {
    id: uuidv4(),
    officerId, checkpointId: checkpointId || null,
    title, description: description || '',
    severity, status: 'open',
  }
  await db.run(`
    INSERT INTO incidents (id, officerId, checkpointId, title, description, severity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, Object.values(incident))
  const full = await db.get(`
    SELECT i.*, u.name as officerName FROM incidents i JOIN users u ON i.officerId = u.id WHERE i.id = ?
  `, [incident.id])
  if (app?.get('io')) app.get('io').emit('incident:new', full)
}

const router = Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
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

  const scans = await db.all(query, params)
  res.json(scans.map(normalizeScan))
})

router.get('/recent', async (req, res) => {
  const scans = await db.all(`
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
    ORDER BY s.receivedAt DESC LIMIT 20
  `)
  res.json(scans.map(normalizeScan))
})

router.get('/:id', async (req, res) => {
  const scan = await db.get(`
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
    WHERE s.id = ?
  `, [req.params.id])

  if (!scan) return res.status(404).json({ message: 'Scan not found' })
  res.json(normalizeScan(scan))
})

router.post('/', async (req, res) => {
  const { checkpointId, gpsLatitude, gpsLongitude, notes } = req.body

  if (!checkpointId) {
    return res.status(400).json({ message: 'checkpointId is required' })
  }

  const checkpoint = await db.get('SELECT * FROM checkpoints WHERE id = ?', [checkpointId])
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
      await createIncident(
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

  await db.run(`
    INSERT INTO scans (id, officerId, checkpointId, scannedAt, gpsLatitude, gpsLongitude, gpsValid, distanceMeters, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(scan))

  const fullScan = await db.get(`
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
    WHERE s.id = ?
  `, [scan.id])

  const scanResult = normalizeScan(fullScan)

  if (req.app.get('io')) {
    req.app.get('io').emit('scan:new', scanResult)
  }

  res.status(201).json(scanResult)
})

export default router
