import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { enhanceIncidentReport } from '../services/ai.js'
import { buildFiveWsAndH, sendNotificationBundle } from '../services/notifications.js'
import { normalizeRole } from '../utils/roles.js'

const router = Router()
router.use(authMiddleware)

async function getSetting(key, fallback = '') {
  const row = await db.get('SELECT settingValue FROM communicationSettings WHERE settingKey = ? ORDER BY createdAt DESC LIMIT 1', [key])
  return row?.settingValue ?? row?.settingvalue ?? fallback
}

router.get('/', async (req, res) => {
  const { status } = req.query
  const role = normalizeRole(req.user?.role)
  const conditions = []
  const params = []

  if (status) {
    conditions.push('i.status = ?')
    params.push(status)
  }

  if (role === 'guard') {
    conditions.push('i.officerId = ?')
    params.push(req.user.id)
  } else if (role === 'main_account') {
    conditions.push(`(
      i.checkpointId IN (SELECT id FROM checkpoints WHERE clientId = ?)
      OR i.officerId IN (SELECT id FROM users WHERE clientId = ?)
    )`)
    params.push(req.user.clientId, req.user.clientId)
  } else if (role === 'supervisor') {
    conditions.push(`(
      i.checkpointId IN (SELECT c.id FROM checkpoints c WHERE c.siteId IN (
        SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?
      ))
      OR i.officerId = ?
    )`)
    params.push(req.user.id, req.user.id)
  }

  let query = `
    SELECT i.*, u.name as officerName, c.name as checkpointName
    FROM incidents i
    JOIN users u ON i.officerId = u.id
    LEFT JOIN checkpoints c ON i.checkpointId = c.id
  `
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
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

  const incidentRecipients = (await getSetting(
    'incident_email_recipients',
    await getSetting('report_email_recipients', ''),
  )).split(',').map((v) => v.trim()).filter(Boolean)

  const fiveWs = buildFiveWsAndH({
    who: req.user.name,
    what: finalTitle,
    when: full.reportedAt,
    where: full.checkpointName || 'Unknown checkpoint',
    why: finalDescription,
    how: 'Submitted through the incident reporting workflow.',
  })

  const delivery = await sendNotificationBundle({
    emails: incidentRecipients,
    subject: `Incident Report: ${finalTitle}`,
    html: `
      <h2>Incident Report</h2>
      <p><strong>Who:</strong> ${fiveWs.who}</p>
      <p><strong>What:</strong> ${fiveWs.what}</p>
      <p><strong>When:</strong> ${fiveWs.when}</p>
      <p><strong>Where:</strong> ${fiveWs.where}</p>
      <p><strong>Why:</strong> ${fiveWs.why}</p>
      <p><strong>How:</strong> ${fiveWs.how}</p>
    `,
    text: `Incident Report\nWho: ${fiveWs.who}\nWhat: ${fiveWs.what}\nWhen: ${fiveWs.when}\nWhere: ${fiveWs.where}\nWhy: ${fiveWs.why}\nHow: ${fiveWs.how}`,
  })

  if (req.app.get('io')) {
    req.app.get('io').emit('incident:new', full)
  }

  res.status(201).json({ ...full, delivery })
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
  const role = normalizeRole(req.user?.role)
  let cpQuery = 'SELECT * FROM checkpoints WHERE active = 1'
  const cpParams = []

  if (role === 'main_account') {
    cpQuery += ' AND clientId = ?'
    cpParams.push(req.user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    cpQuery += ` AND (
      siteId IN (SELECT siteId FROM user_site_assignments WHERE userId = ?)
      OR id IN (SELECT DISTINCT checkpointId FROM scans WHERE officerId = ?)
    )`
    cpParams.push(req.user.id, req.user.id)
  }

  const checkpoints = await db.all(cpQuery, cpParams)
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
        message: `No scan detected at ${cp.name} within the scheduled ${interval} min patrol interval`,
        expectedInterval: `${interval}min`,
        lastScan: null,
        timeOverdue: null,
      })
    } else {
      const lastScanTime = new Date(lastScan.scannedAt).getTime()
      const elapsed = Math.floor((now - lastScanTime) / 60000)
      if (elapsed >= interval) {
        missed.push({
          checkpointId: cp.id,
          checkpointName: cp.name,
          checkpointCode: cp.code,
          type: 'overdue',
          message: `No scan detected at ${cp.name} for ${elapsed} min (scheduled patrol interval is ${interval} min)`,
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
