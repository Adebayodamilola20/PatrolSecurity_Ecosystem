import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { enhanceIncidentReport } from '../services/ai.js'

const router = Router()

router.use(authMiddleware)

router.get('/', (req, res) => {
  const { status } = req.query
  let query = `
    SELECT i.*, u.name as officerName, c.name as checkpointName
    FROM incidents i
    JOIN users u ON i.officerId = u.id
    LEFT JOIN checkpoints c ON i.checkpointId = c.id
  `
  const params = []
  if (status) {
    query += ' WHERE i.status = ?'
    params.push(status)
  }
  query += ' ORDER BY i.reportedAt DESC'
  const incidents = db.prepare(query).all(...params)
  res.json(incidents)
})

router.post('/', async (req, res) => {
  const { checkpointId, title, description, severity, enhance } = req.body
  if (!title) {
    return res.status(400).json({ message: 'title is required' })
  }

  const validSeverity = ['low', 'medium', 'high', 'critical']
  let finalTitle = title
  let finalDescription = description || ''
  let finalSeverity = validSeverity.includes(severity) ? severity : 'low'

  if (enhance && description) {
    const enhanced = await enhanceIncidentReport(description)
    finalTitle = enhanced.summary.slice(0, 100) || title
    finalDescription = enhanced.enhanced
    finalSeverity = enhanced.severity
  }

  const incident = {
    id: uuidv4(),
    officerId: req.user.id,
    checkpointId: checkpointId || null,
    title: finalTitle,
    description: finalDescription,
    severity: finalSeverity,
    status: 'open',
  }

  db.prepare(`
    INSERT INTO incidents (id, officerId, checkpointId, title, description, severity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(...Object.values(incident))

  const full = db.prepare(`
    SELECT i.*, u.name as officerName
    FROM incidents i
    JOIN users u ON i.officerId = u.id
    WHERE i.id = ?
  `).get(incident.id)

  if (req.app.get('io')) {
    req.app.get('io').emit('incident:new', full)
  }

  res.status(201).json(full)
})

router.patch('/:id/status', (req, res) => {
  const { status } = req.body
  const valid = ['open', 'investigating', 'resolved']
  if (!valid.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' })
  }

  const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ message: 'Incident not found' })

  const resolvedAt = status === 'resolved' ? new Date().toISOString() : null
  db.prepare('UPDATE incidents SET status = ?, resolvedAt = ? WHERE id = ?')
    .run(status, resolvedAt, req.params.id)

  const updated = db.prepare(`
    SELECT i.*, u.name as officerName, c.name as checkpointName
    FROM incidents i
    JOIN users u ON i.officerId = u.id
    LEFT JOIN checkpoints c ON i.checkpointId = c.id
    WHERE i.id = ?
  `).get(req.params.id)

  res.json(updated)
})

router.get('/missed-patrols', (req, res) => {
  const checkpoints = db.prepare('SELECT * FROM checkpoints WHERE active = 1').all()
  const missed = []

  for (const cp of checkpoints) {
    const lastScan = db.prepare(`
      SELECT s.*, u.name as officerName
      FROM scans s
      JOIN users u ON s.officerId = u.id
      WHERE s.checkpointId = ?
      ORDER BY s.scannedAt DESC
      LIMIT 1
    `).get(cp.id)

    const interval = cp.expectedIntervalMinutes || 30
    const now = Date.now()

    if (!lastScan) {
      missed.push({
        checkpointId: cp.id,
        checkpointName: cp.name,
        checkpointCode: cp.code,
        type: 'never_scanned',
        message: `No scan detected at ${cp.name} — never scanned`,
        expectedInterval: `${interval}min`,
        lastScan: null,
        timeOverdue: null,
      })
    } else {
      const lastScanTime = new Date(lastScan.scannedAt).getTime()
      const elapsed = Math.floor((now - lastScanTime) / 60000)
      if (elapsed > interval) {
        missed.push({
          checkpointId: cp.id,
          checkpointName: cp.name,
          checkpointCode: cp.code,
          type: 'overdue',
          message: `No scan detected at ${cp.name} for ${elapsed} min (expected every ${interval} min)`,
          expectedInterval: `${interval}min`,
          lastScan: lastScan.scannedAt,
          lastOfficer: lastScan.officerName,
          timeOverdue: `${elapsed} min overdue`,
        })
      }
    }
  }

  res.json(missed)
})

export default router
