import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { buildFiveWsAndH, sendNotificationBundle } from '../services/notifications.js'
import { canExport, normalizeRole } from '../utils/roles.js'

const router = Router()
router.use(authMiddleware)

async function getSetting(key, fallback = '') {
  const row = await db.get('SELECT settingValue FROM communicationSettings WHERE settingKey = ? ORDER BY createdAt DESC LIMIT 1', [key])
  return row?.settingValue ?? row?.settingvalue ?? fallback
}

async function createSubmission({ type, title, summary = '', details = {}, checkpointId = null, siteLabel = '', req }) {
  const submission = {
    id: uuidv4(),
    type,
    title,
    summary,
    detailsJson: JSON.stringify(details),
    checkpointId,
    siteLabel,
    userId: req.user.id,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
  }

  await db.run(`
    INSERT INTO reportSubmissions (
      id, type, title, summary, detailsJson, checkpointId, siteLabel,
      userId, status, submittedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(submission))

  return submission
}

async function emailReportSubmission({ submission, req, subjectPrefix, details }) {
  const recipients = (await getSetting('report_email_recipients', '')).split(',').map((v) => v.trim()).filter(Boolean)
  const fiveWs = buildFiveWsAndH({
    who: req?.user?.name || 'System',
    what: submission.title,
    when: submission.submittedAt,
    where: submission.siteLabel || details.checkpointName || 'Unknown site',
    why: details.openIssues || details.issue || details.description || '',
    how: details.activities || details.instructions || details.summary || '',
  })

  const payload = await sendNotificationBundle({
    emails: recipients,
    subject: `${subjectPrefix}: ${submission.title}`,
    html: `
      <h2>${subjectPrefix}</h2>
      <p><strong>Who:</strong> ${fiveWs.who}</p>
      <p><strong>What:</strong> ${fiveWs.what}</p>
      <p><strong>When:</strong> ${fiveWs.when}</p>
      <p><strong>Where:</strong> ${fiveWs.where}</p>
      <p><strong>Why:</strong> ${fiveWs.why}</p>
      <p><strong>How:</strong> ${fiveWs.how}</p>
      <pre>${JSON.stringify(details, null, 2)}</pre>
    `,
    text: `${subjectPrefix}\nWho: ${fiveWs.who}\nWhat: ${fiveWs.what}\nWhen: ${fiveWs.when}\nWhere: ${fiveWs.where}\nWhy: ${fiveWs.why}\nHow: ${fiveWs.how}`,
  })

  await db.run('UPDATE reportSubmissions SET status = ?, emailedAt = ?, deliveryPayload = ? WHERE id = ?', [
    'emailed',
    new Date().toISOString(),
    JSON.stringify(payload),
    submission.id,
  ])

  return payload
}

function buildReportHtml({ report, scans, shifts, verified, flagged, totalHours }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Patrol Report</title>
<style>
  body { font-family: 'Inter', -apple-system, sans-serif; color: #1a1a1a; padding: 40px; background: #fff; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  .stats { display: flex; gap: 16px; margin-bottom: 28px; }
  .stat { background: #f5f5f5; padding: 14px 20px; border-radius: 10px; flex: 1; }
  .stat .val { font-size: 26px; font-weight: 700; }
  .stat .lbl { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #e5e5e5; color: #666; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-v { background: #e6f7e6; color: #166534; }
  .badge-f { background: #fee9e7; color: #b91c1c; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
</style></head>
<body>
  <h1>Patrol Monitoring Report</h1>
  <div class="sub">${report.clientEmail} &middot; ${new Date(report.periodStart).toLocaleDateString()} - ${new Date(report.periodEnd).toLocaleDateString()}</div>
  <div class="stats">
    <div class="stat"><div class="val">${scans.length}</div><div class="lbl">Total Scans</div></div>
    <div class="stat"><div class="val">${verified}</div><div class="lbl">Verified</div></div>
    <div class="stat"><div class="val">${flagged}</div><div class="lbl">Flagged</div></div>
    <div class="stat"><div class="val">${Math.round(totalHours / 3600000 * 10) / 10}h</div><div class="lbl">Patrol Hours</div></div>
  </div>
  <h2 style="font-size:16px;margin-bottom:12px;">Scan Details</h2>
  <table>
    <tr><th>Time</th><th>Officer</th><th>Checkpoint</th><th>Distance</th><th>Status</th></tr>
    ${scans.map(s => `<tr>
      <td>${new Date(s.scannedAt).toLocaleString()}</td>
      <td>${s.officerName}</td>
      <td>${s.checkpointName} (${s.checkpointCode})</td>
      <td>${s.distanceMeters ? s.distanceMeters + 'm' : '-'}</td>
      <td><span class="badge ${s.gpsValid ? 'badge-v' : 'badge-f'}">${s.gpsValid ? 'Verified' : 'Flagged'}</span></td>
    </tr>`).join('')}
  </table>
  <div class="footer">Generated by Patrol Monitoring System &middot; ${new Date().toISOString()}</div>
</body></html>`
}

async function buildReportData(report) {
  const scans = await db.all(`
    SELECT s.*, u.name as officerName, c.name as checkpointName, c.code as checkpointCode
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
    WHERE s.scannedAt >= ? AND s.scannedAt <= ?
    ORDER BY s.scannedAt DESC
  `, [report.periodStart, report.periodEnd])

  const shifts = await db.all(`
    SELECT s.*, u.name as userName FROM shifts s
    JOIN users u ON s.userId = u.id
    WHERE s.clockIn >= ? AND (s.clockOut IS NULL OR s.clockOut <= ?)
  `, [report.periodStart, report.periodEnd])

  const totalHours = shifts.reduce((acc, s) => {
    if (!s.clockOut) return acc
    return acc + (new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime())
  }, 0)

  const verified = scans.filter(s => s.gpsValid).length
  const flagged = scans.length - verified

  return { scans, shifts, verified, flagged, totalHours }
}

async function sendReportEmail(report) {
  const data = await buildReportData(report)
  const html = buildReportHtml({ report, ...data })

  const recipients = report.clientEmail.split(',').map(v => v.trim()).filter(Boolean)
  const ccRecipients = (await getSetting('report_email_recipients', '')).split(',').map(v => v.trim()).filter(Boolean)

  const allRecipients = [...new Set([...recipients, ...ccRecipients])]
  if (allRecipients.length === 0) return { skipped: true, reason: 'No recipients' }

  const result = await sendNotificationBundle({
    emails: allRecipients,
    subject: `Patrol Report — ${new Date(report.periodStart).toLocaleDateString()} to ${new Date(report.periodEnd).toLocaleDateString()}`,
    html,
    text: `Patrol Report\nPeriod: ${report.periodStart} — ${report.periodEnd}\nTotal scans: ${data.scans.length}\nVerified: ${data.verified}\nFlagged: ${data.flagged}\nPatrol hours: ${Math.round(data.totalHours / 3600000 * 10) / 10}h`,
  })

  return result
}

router.get('/', async (req, res) => {
  const role = normalizeRole(req.user?.role)

  const [reports, submissions] = await Promise.all([
    db.all('SELECT * FROM reports ORDER BY createdAt DESC'),
    (() => {
      let query = `
        SELECT rs.*, u.name as userName
        FROM reportSubmissions rs
        JOIN users u ON rs.userId = u.id
      `
      const conditions = []
      const params = []

      if (role === 'main_account') {
        conditions.push('rs.userId IN (SELECT id FROM users WHERE clientId = ?)')
        params.push(req.user.clientId)
      } else if (role === 'supervisor' || role === 'guard') {
        conditions.push('rs.userId = ?')
        params.push(req.user.id)
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ')
      }
      query += ' ORDER BY rs.submittedAt DESC'
      return db.all(query, params)
    })(),
  ])

  res.json({ reports, submissions })
})

router.post('/daily-activity', async (req, res) => {
  const { summary, activities = '', openIssues = '', siteLabel = '', checkpointId = null, shiftWindow = '' } = req.body
  if (!summary) {
    return res.status(400).json({ message: 'summary is required' })
  }

  const submission = await createSubmission({
    type: 'daily_activity',
    title: `Daily Activity Report - ${siteLabel || req.user.name}`,
    summary,
    details: { summary, activities, openIssues, siteLabel, checkpointId, shiftWindow },
    checkpointId,
    siteLabel,
    req,
  })

  const delivery = await emailReportSubmission({
    submission,
    req,
    subjectPrefix: 'Daily Activity Report',
    details: { summary, activities, openIssues, siteLabel, checkpointId, shiftWindow },
  })

  res.status(201).json({ ...submission, delivery })
})

router.post('/maintenance', async (req, res) => {
  const { title, issue, assetName = '', severity = 'medium', checkpointId = null } = req.body
  if (!title || !issue) {
    return res.status(400).json({ message: 'title and issue are required' })
  }

  const submission = await createSubmission({
    type: 'maintenance',
    title,
    summary: issue,
    details: { title, issue, assetName, severity, checkpointId },
    checkpointId,
    req,
  })

  const delivery = await emailReportSubmission({
    submission,
    req,
    subjectPrefix: 'Maintenance Report',
    details: { title, issue, assetName, severity, checkpointId },
  })

  res.status(201).json({ ...submission, delivery })
})

router.post('/generate', async (req, res) => {
  const { clientEmail, periodStart, periodEnd, format } = req.body
  if (!clientEmail || !periodStart || !periodEnd) {
    return res.status(400).json({ message: 'clientEmail, periodStart, periodEnd are required' })
  }

  const report = {
    id: uuidv4(),
    clientEmail,
    periodStart,
    periodEnd,
    format: format || 'pdf',
    sentAt: null,
  }

  await db.run(`
    INSERT INTO reports (id, clientEmail, periodStart, periodEnd, format, status, sentAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [report.id, report.clientEmail, report.periodStart, report.periodEnd, report.format, 'generating', report.sentAt])

  try {
    const result = await sendReportEmail(report)

    await db.run(
      `UPDATE reports SET status = ?, sentAt = ? WHERE id = ?`,
      [result.skipped ? 'failed' : 'sent', result.skipped ? null : new Date().toISOString(), report.id]
    )

    res.status(201).json({
      ...report,
      status: result.skipped ? 'failed' : 'sent',
      delivery: result,
    })
  } catch (err) {
    await db.run(
      `UPDATE reports SET status = ? WHERE id = ?`,
      ['failed', report.id]
    )
    console.error('[reports:generate]', err.message)
    res.status(500).json({ message: err.message || 'Failed to generate and send report' })
  }
})

router.post('/:id/resend', async (req, res) => {
  const report = await db.get('SELECT * FROM reports WHERE id = ?', [req.params.id])
  if (!report) return res.status(404).json({ message: 'Report not found' })

  try {
    const result = await sendReportEmail(report)

    await db.run(
      `UPDATE reports SET status = ?, sentAt = ? WHERE id = ?`,
      [result.skipped ? 'failed' : 'sent', result.skipped ? null : new Date().toISOString(), report.id]
    )

    res.json({ ...report, status: result.skipped ? 'failed' : 'sent', delivery: result })
  } catch (err) {
    await db.run(`UPDATE reports SET status = ? WHERE id = ?`, ['failed', report.id])
    res.status(500).json({ message: err.message })
  }
})

router.post('/export-request', async (req, res) => {
  if (!canExport(req.user.role)) {
    return res.status(403).json({ message: 'Only Admin and Main Account can request exports' })
  }

  const { date, format = 'xlsx' } = req.body
  if (!date) {
    return res.status(400).json({ message: 'date is required' })
  }

  const recipients = (await getSetting('export_email_recipients', '')).split(',').map((v) => v.trim()).filter(Boolean)
  const submission = await createSubmission({
    type: 'export_request',
    title: `Daily Tour Export Request - ${date}`,
    summary: `Requested export in ${format} format`,
    details: { date, format, requestedBy: req.user.email },
    req,
  })

  const delivery = await sendNotificationBundle({
    emails: recipients,
    subject: `Daily Tour Export Request (${format.toUpperCase()})`,
    html: `<p>${req.user.name} requested a ${format.toUpperCase()} export for ${date}.</p>`,
    text: `${req.user.name} requested a ${format.toUpperCase()} export for ${date}.`,
  })

  await db.run('UPDATE reportSubmissions SET status = ?, emailedAt = ?, deliveryPayload = ? WHERE id = ?', [
    'emailed',
    new Date().toISOString(),
    JSON.stringify(delivery),
    submission.id,
  ])

  res.status(201).json({ ...submission, delivery })
})

router.get('/:id/pdf', async (req, res) => {
  const report = await db.get('SELECT * FROM reports WHERE id = ?', [req.params.id])
  if (!report) return res.status(404).json({ message: 'Report not found' })

  const data = await buildReportData(report)
  const html = buildReportHtml({ report, ...data })

  res.setHeader('Content-Type', 'text/html')
  res.send(html)
})

export default router
