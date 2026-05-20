import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { buildFiveWsAndH, sendNotificationBundle } from '../services/notifications.js'
import { normalizeRole } from '../utils/roles.js'

const router = Router()
router.use(authMiddleware)

async function getSetting(key, fallback = '') {
  const row = await db.get('SELECT settingValue FROM communicationSettings WHERE settingKey = ? ORDER BY createdAt DESC LIMIT 1', [key])
  return row?.settingValue ?? row?.settingvalue ?? fallback
}

router.get('/', async (req, res) => {
  const role = normalizeRole(req.user?.role)
  let query = `
    SELECT pl.*, u.name as createdByName
    FROM passOnLogs pl
    JOIN users u ON pl.createdBy = u.id
  `
  const conditions = []
  const params = []

  if (role === 'main_account') {
    conditions.push(`(
      pl.checkpointId IN (SELECT id FROM checkpoints WHERE clientId = ?)
      OR pl.siteLabel IN (SELECT name FROM sites WHERE clientId = ?)
    )`)
    params.push(req.user.clientId, req.user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    conditions.push(`(
      pl.checkpointId IN (SELECT c.id FROM checkpoints c WHERE c.siteId IN (
        SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?
      ))
      OR pl.createdBy = ?
    )`)
    params.push(req.user.id, req.user.id)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY pl.createdAt DESC'

  const logs = await db.all(query, params)
  res.json(logs)
})

router.post('/', async (req, res) => {
  const { title, instruction, priority = 'normal', siteLabel = '', checkpointId = null, requiresAcknowledgement = false } = req.body
  if (!title || !instruction) {
    return res.status(400).json({ message: 'title and instruction are required' })
  }

  const record = {
    id: uuidv4(),
    title,
    instruction,
    priority,
    siteLabel,
    checkpointId,
    requiresAcknowledgement: requiresAcknowledgement ? 1 : 0,
    createdBy: req.user.id,
    active: 1,
  }

  await db.run(`
    INSERT INTO passOnLogs (
      id, title, instruction, priority, siteLabel, checkpointId,
      requiresAcknowledgement, createdBy, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(record))

  const recipients = (await getSetting('report_email_recipients', '')).split(',').map((v) => v.trim()).filter(Boolean)
  const fiveWs = buildFiveWsAndH({
    who: req.user.name,
    what: title,
    when: new Date().toISOString(),
    where: siteLabel || checkpointId || 'General site notice',
    why: instruction,
    how: 'Pass-on-log created from operations workflow.',
  })

  const delivery = await sendNotificationBundle({
    emails: recipients,
    subject: `Pass-On Log: ${title}`,
    html: `
      <h2>Pass-On Log</h2>
      <p><strong>Who:</strong> ${fiveWs.who}</p>
      <p><strong>What:</strong> ${fiveWs.what}</p>
      <p><strong>When:</strong> ${fiveWs.when}</p>
      <p><strong>Where:</strong> ${fiveWs.where}</p>
      <p><strong>Why:</strong> ${fiveWs.why}</p>
      <p><strong>How:</strong> ${fiveWs.how}</p>
    `,
    text: `Pass-On Log\nWho: ${fiveWs.who}\nWhat: ${fiveWs.what}\nWhen: ${fiveWs.when}\nWhere: ${fiveWs.where}\nWhy: ${fiveWs.why}\nHow: ${fiveWs.how}`,
  })

  res.status(201).json({ ...record, delivery })
})

router.post('/:id/acknowledge', async (req, res) => {
  const existing = await db.get('SELECT * FROM passOnLogs WHERE id = ? AND active = 1', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Pass-on-log not found' })
  }

  const ack = {
    id: uuidv4(),
    passOnLogId: req.params.id,
    userId: req.user.id,
    acknowledgedAt: new Date().toISOString(),
    note: req.body?.note || '',
  }

  await db.run(`
    INSERT INTO passOnLogAcknowledgements (id, passOnLogId, userId, acknowledgedAt, note)
    VALUES (?, ?, ?, ?, ?)
  `, Object.values(ack))

  res.status(201).json(ack)
})

export default router
