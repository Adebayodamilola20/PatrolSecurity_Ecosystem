import { Router } from 'express'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { normalizeRole } from '../utils/roles.js'

const router = Router()

router.use(authMiddleware)

const ACTIVITY_LABELS = {
  clock_in: 'Clock-In',
  clock_out: 'Clock-Out',
  patrol_scan: 'Patrol Scan',
  incident: 'Incident',
  maintenance: 'Maintenance',
  dar: 'Daily Activity Report',
  emergency: 'Emergency',
  pass_on_log_ack: 'Pass-On Log Ack',
  post_order_ack: 'Post Order Ack',
  visitor_check_in: 'Visitor Check-In',
  visitor_check_out: 'Visitor Check-Out',
  truck_check_in: 'Truck Check-In',
  truck_check_out: 'Truck Check-Out',
}

function read(row, key, fallback = '') {
  return row?.[key] ?? row?.[key.toLowerCase()] ?? fallback
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function endOfDate(value) {
  const date = parseDate(value)
  if (!date) return null
  date.setHours(23, 59, 59, 999)
  return date
}

function isWithinDateRange(value, startDate, endDate) {
  const date = parseDate(value)
  if (!date) return false
  if (startDate && date < startDate) return false
  if (endDate && date > endDate) return false
  return true
}

function csvEscape(value) {
  const str = String(value ?? '')
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCsv(rows) {
  const headers = ['Site', 'Location', 'Activity', 'Date', 'Time', 'Officer', 'Count']
  const lines = rows.map((row) => [
    row.site,
    row.location,
    row.activity,
    row.date,
    row.time,
    row.officer,
    row.count,
  ].map(csvEscape).join(','))
  return [headers.join(','), ...lines].join('\n')
}

function scopedCheckpointCondition(user, alias = 'c') {
  const role = normalizeRole(user?.role)
  if (role === 'admin') return { sql: '', params: [] }
  if (role === 'main_account') {
    return { sql: `${alias}.clientId = ?`, params: [user.clientId] }
  }
  return {
    sql: `(
      ${alias}.siteId IN (SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?)
      OR ${alias}.id IN (SELECT DISTINCT s.checkpointId FROM scans s WHERE s.officerId = ?)
    )`,
    params: [user.id, user.id],
  }
}

function scopedUserCondition(user, alias = 'u') {
  const role = normalizeRole(user?.role)
  if (role === 'admin') return { sql: '', params: [] }
  if (role === 'main_account') {
    return { sql: `${alias}.clientId = ?`, params: [user.clientId] }
  }
  return { sql: `${alias}.id = ?`, params: [user.id] }
}

function addCondition(conditions, params, condition) {
  if (!condition.sql) return
  conditions.push(condition.sql)
  params.push(...condition.params)
}

function buildWhere(conditions) {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
}

function normalizeEvent(row) {
  const activityType = read(row, 'activityType')
  const time = read(row, 'time')
  const date = parseDate(time)
  return {
    site: read(row, 'site') || 'Unassigned',
    location: read(row, 'location') || '',
    activityType,
    activity: ACTIVITY_LABELS[activityType] || read(row, 'activity') || activityType,
    date: date ? date.toISOString().slice(0, 10) : '',
    time,
    officer: read(row, 'officer') || '',
    officerId: read(row, 'officerId') || '',
    clientId: read(row, 'clientId') || '',
    siteId: read(row, 'siteId') || '',
    count: 1,
  }
}

function groupEvents(events) {
  const grouped = new Map()

  for (const event of events) {
    const key = [
      event.siteId,
      event.site,
      event.location,
      event.activityType,
      event.date,
      event.officerId,
      event.officer,
    ].join('|')

    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      if (event.time > existing.time) existing.time = event.time
    } else {
      grouped.set(key, { ...event })
    }
  }

  return Array.from(grouped.values()).sort((a, b) => String(b.time).localeCompare(String(a.time)))
}

async function loadActivityEvents(user) {
  const events = []

  {
    const conditions = []
    const params = []
    addCondition(conditions, params, scopedUserCondition(user, 'u'))
    const rows = await db.all(`
      SELECT
        'clock_in' as activityType,
        s.clockIn as time,
        s.userId as officerId,
        u.name as officer,
        s.siteLabel as site,
        '' as location,
        u.clientId as clientId,
        NULL as siteId
      FROM shifts s
      JOIN users u ON s.userId = u.id
      ${buildWhere(conditions)}
    `, params)
    events.push(...rows)
  }

  {
    const conditions = ['s.clockOut IS NOT NULL']
    const params = []
    addCondition(conditions, params, scopedUserCondition(user, 'u'))
    const rows = await db.all(`
      SELECT
        'clock_out' as activityType,
        s.clockOut as time,
        s.userId as officerId,
        u.name as officer,
        s.siteLabel as site,
        '' as location,
        u.clientId as clientId,
        NULL as siteId
      FROM shifts s
      JOIN users u ON s.userId = u.id
      ${buildWhere(conditions)}
    `, params)
    events.push(...rows)
  }

  {
    const conditions = []
    const params = []
    addCondition(conditions, params, scopedCheckpointCondition(user, 'c'))
    const rows = await db.all(`
      SELECT
        'patrol_scan' as activityType,
        COALESCE(s.receivedAt, s.scannedAt) as time,
        s.officerId as officerId,
        u.name as officer,
        COALESCE(st.name, c.name) as site,
        COALESCE(st.location, c.name) as location,
        c.clientId as clientId,
        c.siteId as siteId
      FROM scans s
      JOIN users u ON s.officerId = u.id
      JOIN checkpoints c ON s.checkpointId = c.id
      LEFT JOIN sites st ON c.siteId = st.id
      ${buildWhere(conditions)}
    `, params)
    events.push(...rows)
  }

  {
    const conditions = []
    const params = []
    addCondition(conditions, params, scopedCheckpointCondition(user, 'c'))
    const rows = await db.all(`
      SELECT
        'incident' as activityType,
        i.reportedAt as time,
        i.officerId as officerId,
        u.name as officer,
        COALESCE(st.name, c.name, i.title) as site,
        COALESCE(st.location, c.name, '') as location,
        COALESCE(c.clientId, u.clientId) as clientId,
        c.siteId as siteId
      FROM incidents i
      JOIN users u ON i.officerId = u.id
      LEFT JOIN checkpoints c ON i.checkpointId = c.id
      LEFT JOIN sites st ON c.siteId = st.id
      ${buildWhere(conditions)}
    `, params)
    events.push(...rows)
  }

  {
    const conditions = []
    const params = []
    addCondition(conditions, params, scopedCheckpointCondition(user, 'c'))
    const rows = await db.all(`
      SELECT
        CASE WHEN LOWER(rs.type) = 'maintenance' THEN 'maintenance' ELSE 'dar' END as activityType,
        rs.submittedAt as time,
        rs.userId as officerId,
        u.name as officer,
        COALESCE(st.name, rs.siteLabel, c.name) as site,
        COALESCE(st.location, rs.siteLabel, c.name, '') as location,
        COALESCE(c.clientId, u.clientId) as clientId,
        c.siteId as siteId
      FROM reportSubmissions rs
      JOIN users u ON rs.userId = u.id
      LEFT JOIN checkpoints c ON rs.checkpointId = c.id
      LEFT JOIN sites st ON c.siteId = st.id
      ${buildWhere(conditions)}
    `, params)
    events.push(...rows)
  }

  {
    const conditions = []
    const params = []
    addCondition(conditions, params, scopedCheckpointCondition(user, 'c'))
    const rows = await db.all(`
      SELECT
        'emergency' as activityType,
        ee.triggeredAt as time,
        ee.userId as officerId,
        u.name as officer,
        COALESCE(st.name, ee.siteLabel, c.name) as site,
        COALESCE(st.location, ee.siteLabel, c.name, '') as location,
        COALESCE(c.clientId, u.clientId) as clientId,
        c.siteId as siteId
      FROM emergencyEvents ee
      JOIN users u ON ee.userId = u.id
      LEFT JOIN checkpoints c ON ee.checkpointId = c.id
      LEFT JOIN sites st ON c.siteId = st.id
      ${buildWhere(conditions)}
    `, params)
    events.push(...rows)
  }

  {
    const conditions = []
    const params = []
    addCondition(conditions, params, scopedCheckpointCondition(user, 'c'))
    const rows = await db.all(`
      SELECT
        'post_order_ack' as activityType,
        COALESCE(poc.completedAt, poc.acknowledgedAt, poc.createdAt) as time,
        poc.userId as officerId,
        u.name as officer,
        COALESCE(st.name, c.name, po.title) as site,
        COALESCE(st.location, c.name, '') as location,
        COALESCE(c.clientId, u.clientId) as clientId,
        c.siteId as siteId
      FROM postOrderCompletions poc
      JOIN users u ON poc.userId = u.id
      JOIN postOrders po ON poc.postOrderId = po.id
      LEFT JOIN checkpoints c ON COALESCE(poc.checkpointId, po.checkpointId) = c.id
      LEFT JOIN sites st ON c.siteId = st.id
      ${buildWhere(conditions)}
    `, params)
    events.push(...rows)
  }

  {
    const conditions = []
    const params = []
    addCondition(conditions, params, scopedCheckpointCondition(user, 'c'))
    const rows = await db.all(`
      SELECT
        'pass_on_log_ack' as activityType,
        pla.acknowledgedAt as time,
        pla.userId as officerId,
        u.name as officer,
        COALESCE(st.name, pl.siteLabel, c.name, pl.title) as site,
        COALESCE(st.location, pl.siteLabel, c.name, '') as location,
        COALESCE(c.clientId, u.clientId) as clientId,
        c.siteId as siteId
      FROM passOnLogAcknowledgements pla
      JOIN users u ON pla.userId = u.id
      JOIN passOnLogs pl ON pla.passOnLogId = pl.id
      LEFT JOIN checkpoints c ON pl.checkpointId = c.id
      LEFT JOIN sites st ON c.siteId = st.id
      ${buildWhere(conditions)}
    `, params)
    events.push(...rows)
  }

  return events.map(normalizeEvent).filter((event) => event.time)
}

function filterEvents(events, query) {
  const startDate = parseDate(query.startDate)
  const endDate = endOfDate(query.endDate)
  const limit = Math.min(Number(query.limit || 500) || 500, 5000)

  return groupEvents(events.filter((event) => {
    if (query.activityType && event.activityType !== query.activityType) return false
    if (query.officerId && event.officerId !== query.officerId) return false
    if (query.clientId && event.clientId !== query.clientId) return false
    if (query.siteId && event.siteId !== query.siteId) return false
    return isWithinDateRange(event.time, startDate, endDate)
  })).slice(0, limit)
}

router.get('/', async (req, res) => {
  try {
    const events = await loadActivityEvents(req.user)
    res.json(filterEvents(events, req.query))
  } catch (error) {
    console.error('[activity-summary:list]', error)
    res.status(500).json({ message: 'Could not load activity summary right now.' })
  }
})

router.get('/export', async (req, res) => {
  try {
    const events = await loadActivityEvents(req.user)
    const rows = filterEvents(events, { ...req.query, limit: 5000 })
    const format = String(req.query.format || 'csv').toLowerCase()
    const csv = toCsv(rows)

    if (format === 'excel' || format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.ms-excel')
      res.setHeader('Content-Disposition', 'attachment; filename=site-activity-summary.xls')
      return res.send(csv)
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename=site-activity-summary.html')
      return res.send(`<!doctype html><html><head><title>Site Activity Summary</title></head><body><h1>Site Activity Summary</h1><pre>${csv
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre></body></html>`)
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=site-activity-summary.csv')
    res.send(csv)
  } catch (error) {
    console.error('[activity-summary:export]', error)
    res.status(500).json({ message: 'Could not export activity summary right now.' })
  }
})

export default router
