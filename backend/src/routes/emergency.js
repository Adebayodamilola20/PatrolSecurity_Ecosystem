import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { buildFiveWsAndH, sendNotificationBundle } from '../services/notifications.js'

const router = Router()
router.use(authMiddleware)

async function getSetting(key, fallback = '') {
  const row = await db.get('SELECT settingValue FROM communicationSettings WHERE settingKey = ? ORDER BY createdAt DESC LIMIT 1', [key])
  return row?.settingValue ?? row?.settingvalue ?? fallback
}

router.get('/settings', async (_req, res) => {
  const settings = await db.all('SELECT settingKey, settingValue, scopeType, scopeId, updatedBy, createdAt FROM communicationSettings ORDER BY createdAt DESC')
  res.json(settings)
})

router.post('/settings', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' })
  }

  const { settingKey, settingValue, scopeType = 'global', scopeId = '' } = req.body
  if (!settingKey) {
    return res.status(400).json({ message: 'settingKey is required' })
  }

  const row = {
    id: uuidv4(),
    scopeType,
    scopeId,
    settingKey,
    settingValue: typeof settingValue === 'string' ? settingValue : JSON.stringify(settingValue ?? ''),
    updatedBy: req.user.id,
  }

  await db.run(`
    INSERT INTO communicationSettings (id, scopeType, scopeId, settingKey, settingValue, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?)
  `, Object.values(row))

  res.status(201).json(row)
})

router.post('/trigger', async (req, res) => {
  const { checkpointId = null, siteLabel = '', note = '', location = '' } = req.body
  const who = req.user.name || req.user.email
  const emergencyMessage = await getSetting(
    'emergency_message_template',
    'Emergency alert from {{who}} at {{where}}. Immediate response required.'
  )
  const emergencyEmails = (await getSetting('emergency_email_recipients', '')).split(',').map((v) => v.trim()).filter(Boolean)
  const emergencyPhones = (await getSetting('emergency_phone_recipients', '')).split(',').map((v) => v.trim()).filter(Boolean)

  const fiveWs = buildFiveWsAndH({
    who,
    what: 'Emergency distress alert triggered',
    when: new Date().toISOString(),
    where: location || siteLabel || checkpointId || 'Unknown location',
    why: note || 'Emergency assistance requested.',
    how: 'Triggered through the emergency button in the patrol application.',
  })

  const rendered = emergencyMessage
    .replaceAll('{{who}}', fiveWs.who)
    .replaceAll('{{where}}', fiveWs.where)
    .replaceAll('{{when}}', fiveWs.when)
    .replaceAll('{{what}}', fiveWs.what)

  const event = {
    id: uuidv4(),
    userId: req.user.id,
    checkpointId,
    siteLabel,
    message: rendered,
    note,
    triggeredAt: new Date().toISOString(),
    emailRecipients: JSON.stringify(emergencyEmails),
    phoneRecipients: JSON.stringify(emergencyPhones),
    status: 'triggered',
  }

  await db.run(`
    INSERT INTO emergencyEvents (
      id, userId, checkpointId, siteLabel, message, note, triggeredAt,
      emailRecipients, phoneRecipients, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(event))

  const notificationResults = await sendNotificationBundle({
    emails: emergencyEmails,
    phones: emergencyPhones,
    subject: 'Emergency Alert Triggered',
    html: `
      <h2>Emergency Alert Triggered</h2>
      <p><strong>Who:</strong> ${fiveWs.who}</p>
      <p><strong>What:</strong> ${fiveWs.what}</p>
      <p><strong>When:</strong> ${fiveWs.when}</p>
      <p><strong>Where:</strong> ${fiveWs.where}</p>
      <p><strong>Why:</strong> ${fiveWs.why}</p>
      <p><strong>How:</strong> ${fiveWs.how}</p>
      <p><strong>Alert message:</strong> ${rendered}</p>
    `,
    text: `Emergency alert\nWho: ${fiveWs.who}\nWhat: ${fiveWs.what}\nWhen: ${fiveWs.when}\nWhere: ${fiveWs.where}\nWhy: ${fiveWs.why}\nHow: ${fiveWs.how}\nMessage: ${rendered}`,
    sms: rendered,
  })

  await db.run(
    'UPDATE emergencyEvents SET status = ?, deliveryPayload = ? WHERE id = ?',
    ['dispatched', JSON.stringify(notificationResults), event.id],
  )

  if (req.app.get('io')) {
    req.app.get('io').emit('emergency:new', {
      ...event,
      delivery: notificationResults,
    })
  }

  res.status(201).json({
    ...event,
    delivery: notificationResults,
  })
})

export default router
