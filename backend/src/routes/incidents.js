import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { enhanceIncidentReport } from '../services/ai.js'

const router = Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
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
  const incidents = await db.all(query, params)
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

  await db.run(`
    INSERT INTO incidents (id, officerId, checkpointId, title, description, severity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, Object.values(incident))

  const full = await db.get(`
    SELECT i.*, u.name as officerName, c.name as checkpointName
    FROM incidents i
    JOIN users u ON i.officerId = u.id
    LEFT JOIN checkpoints c ON i.checkpointId = c.id
    WHERE i.id = ?
  `, [incident.id])

  if (req.app.get('io')) {
    req.app.get('io').emit('incident:new', full)
  }

  res.status(201).json(full)
})

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body
  const valid = ['open', 'investigating', 'resolved']
  if (!valid.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' })
  }

  const existing = await db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'Incident not found' })

  const resolvedAt = status === 'resolved' ? new Date().toISOString() : null
  await db.run(
    'UPDATE incidents SET status = ?, resolvedAt = ? WHERE id = ?',
    [status, resolvedAt, req.params.id],
  )

  const updated = await db.get(`
    SELECT i.*, u.name as officerName, c.name as checkpointName
    FROM incidents i
    JOIN users u ON i.officerId = u.id
    LEFT JOIN checkpoints c ON i.checkpointId = c.id
    WHERE i.id = ?
  `, [req.params.id])

  res.json(updated)
})

router.get('/missed-patrols', async (req, res) => {
  const checkpoints = await db.all('SELECT * FROM checkpoints WHERE active = 1')
  const missed = []

  for (const cp of checkpoints) {
    const lastScan = await db.get(`
      SELECT s.*, u.name as officerName
      FROM scans s
      JOIN users u ON s.officerId = u.id
      WHERE s.checkpointId = ?
      ORDER BY s.scannedAt DESC
      LIMIT 1
    `, [cp.id])

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
