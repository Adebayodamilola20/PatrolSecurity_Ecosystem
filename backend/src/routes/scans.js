import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { canExport, normalizeRole } from '../utils/roles.js'
import { buildDayRange, createDailyExportWorkbook } from '../services/excelExport.js'

function normalizeCheckpoint(cp) {
  if (!cp) return cp
  return {
    id: cp.id,
    name: cp.name,
    code: cp.code,
    latitude: cp.latitude,
    longitude: cp.longitude,
    radiusMeters: cp.radiusMeters ?? cp.radiusmeters ?? 10,
    expectedIntervalMinutes: cp.expectedIntervalMinutes ?? cp.expectedintervalminutes ?? 30,
    scheduledTimeIn: cp.scheduledTimeIn ?? cp.scheduledtimein ?? '',
    scheduledTimeOut: cp.scheduledTimeOut ?? cp.scheduledtimeout ?? '',
    active: !!(cp.active ?? cp.active === 1),
    createdAt: cp.createdAt ?? cp.createdat ?? null,
  }
}

// SQLite's datetime('now') writes UTC without a zone marker ("2026-07-27
// 09:15:00"), which Date() would read as LOCAL time. Treat that shape as the
// UTC it actually is, so a scan's age is not off by the server's offset.
function parseDbTimestamp(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const text = String(value)
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// A scan taken offline is recorded at the moment the guard was physically at
// the checkpoint (scannedAt) but only reaches us when connectivity returns
// (receivedAt). Anything beyond a short grace window was queued on the device
// — surface that so a dashboard never has to guess why the two differ.
const SYNC_LAG_GRACE_MS = 2 * 60 * 1000

function normalizeScan(scan) {
  if (!scan) return scan

  const scannedAtDate = parseDbTimestamp(scan.scannedAt ?? scan.scannedat)
  const receivedAtDate = parseDbTimestamp(scan.receivedAt ?? scan.receivedat)
  const syncLagMs =
    scannedAtDate && receivedAtDate
      ? receivedAtDate.getTime() - scannedAtDate.getTime()
      : 0

  return {
    id: scan.id,
    officerId: scan.officerId ?? scan.officerid ?? '',
    officerName: scan.officerName ?? scan.officername ?? '',
    officerPhone: scan.officerPhone ?? scan.officerphone ?? '',
    checkpointId: scan.checkpointId ?? scan.checkpointid ?? '',
    checkpointName: scan.checkpointName ?? scan.checkpointname ?? '',
    checkpointCode: scan.checkpointCode ?? scan.checkpointcode ?? '',
    clientScanId: scan.clientScanId ?? scan.clientscanid ?? null,
    scannedAt: scan.scannedAt ?? scan.scannedat ?? null,
    receivedAt: scan.receivedAt ?? scan.receivedat ?? null,
    gpsLatitude: scan.gpsLatitude ?? scan.gpslatitude ?? null,
    gpsLongitude: scan.gpsLongitude ?? scan.gpslongitude ?? null,
    gpsValid: !!(scan.gpsValid ?? scan.gpsvalid),
    distanceMeters: scan.distanceMeters ?? scan.distancemeters ?? null,
    notes: scan.notes ?? '',
    checkpointActive: !!(scan.checkpointActive ?? scan.checkpointactive),
    // True when this scan sat in the device's offline queue before reaching us.
    syncedLate: syncLagMs > SYNC_LAG_GRACE_MS,
    syncLagSeconds: syncLagMs > SYNC_LAG_GRACE_MS ? Math.round(syncLagMs / 1000) : 0,
  }
}

function normalizeExportFile(row) {
  if (!row) return row
  let totals = {}
  try {
    totals = JSON.parse(row.totalsJson ?? row.totalsjson ?? '{}')
  } catch {}

  return {
    id: row.id,
    type: row.type,
    date: row.date,
    format: row.format ?? 'xlsx',
    status: row.status ?? 'ready',
    scopeLabel: row.scopeLabel ?? row.scopelabel ?? '',
    clientId: row.clientId ?? row.clientid ?? null,
    requestedBy: row.requestedBy ?? row.requestedby ?? '',
    requestedByName: row.requestedByName ?? row.requestedbyname ?? '',
    fileName: row.fileName ?? row.filename ?? '',
    filePath: row.filePath ?? row.filepath ?? '',
    downloadUrl: row.downloadUrl ?? row.downloadurl ?? '',
    totals,
    generatedAt: row.generatedAt ?? row.generatedat ?? null,
    createdAt: row.createdAt ?? row.createdat ?? null,
  }
}

async function createIncident(officerId, checkpointId, title, description, severity, app) {
  const incident = {
    id: uuidv4(),
    officerId,
    checkpointId: checkpointId || null,
    title,
    description: description || '',
    severity,
    status: 'open',
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
           c.name as checkpointName, c.code as checkpointCode, c.active as checkpointActive
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
  `
  const conditions = []
  const params = []
  const role = normalizeRole(req.user?.role)
  if (role === 'guard') {
    conditions.push('s.officerId = ?')
    params.push(req.user.id)
  }
  if (role === 'main_account') {
    conditions.push('c.clientId = ?')
    params.push(req.user.clientId)
  }
  if (role === 'supervisor') {
    conditions.push(`(
      c.siteId IN (SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?)
      OR s.officerId IN (
        SELECT colleague.userId
        FROM user_site_assignments colleague
        WHERE colleague.siteId IN (
          SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?
        )
      )
    )`)
    params.push(req.user.id, req.user.id)
  }
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
  // Patrol chronology, not arrival order: a scan flushed from a device's
  // offline queue belongs where the guard actually took it, not at the top of
  // the history just because it synced last. (Matches reports, exports and
  // timesheets, which all read scannedAt.)
  query += ' ORDER BY s.scannedAt DESC LIMIT ? OFFSET ?'
  params.push(Number(limit), Number(offset))

  const scans = await db.all(query, params)
  res.json(scans.map(normalizeScan))
})

router.get('/recent', async (req, res) => {
  const conditions = []
  const params = []
  const role = normalizeRole(req.user?.role)
  if (role === 'guard') {
    conditions.push('s.officerId = ?')
    params.push(req.user.id)
  }
  if (role === 'main_account') {
    conditions.push('c.clientId = ?')
    params.push(req.user.clientId)
  }
  if (role === 'supervisor') {
    conditions.push(`(
      c.siteId IN (SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?)
      OR s.officerId IN (
        SELECT colleague.userId
        FROM user_site_assignments colleague
        WHERE colleague.siteId IN (
          SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?
        )
      )
    )`)
    params.push(req.user.id, req.user.id)
  }

  let query = `
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode, c.active as checkpointActive
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
  `
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  // Arrival order is deliberate here: this is the control room's live feed of
  // what just came in, including scans that only reached us on a late sync.
  query += ' ORDER BY s.receivedAt DESC LIMIT 20'

  const scans = await db.all(query, params)
  res.json(scans.map(normalizeScan))
})

router.get('/:id', async (req, res) => {
  let query = `
    SELECT s.*, u.name as officerName, u.phone as officerPhone,
           c.name as checkpointName, c.code as checkpointCode, c.active as checkpointActive
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
    WHERE s.id = ?
  `
  const params = [req.params.id]
  const role = normalizeRole(req.user?.role)
  if (role === 'guard') {
    query += ' AND s.officerId = ?'
    params.push(req.user.id)
  } else if (role === 'main_account') {
    query += ' AND c.clientId = ?'
    params.push(req.user.clientId)
  } else if (role === 'supervisor') {
    query += ` AND (
      c.siteId IN (SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?)
      OR s.officerId IN (
        SELECT colleague.userId
        FROM user_site_assignments colleague
        WHERE colleague.siteId IN (
          SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?
        )
      )
    )`
    params.push(req.user.id, req.user.id)
  }

  const scan = await db.get(query, params)

  if (!scan) return res.status(404).json({ message: 'Scan not found' })
  res.json(normalizeScan(scan))
})

const SCAN_DETAIL_SELECT = `
  SELECT s.*, u.name as officerName, u.phone as officerPhone,
         c.name as checkpointName, c.code as checkpointCode, c.active as checkpointActive
  FROM scans s
  JOIN users u ON s.officerId = u.id
  JOIN checkpoints c ON s.checkpointId = c.id
`

// A device clock that is a little fast must not produce a scan stamped in the
// future — those sort ahead of everything and imply a patrol that has not
// happened yet. A timestamp in the PAST is kept exactly as the device recorded
// it, however stale: that is when the guard was actually standing there, and
// receivedAt already tells the reviewer how late it arrived.
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000

function resolveScannedAt(raw, now) {
  if (raw == null || raw === '') return now.toISOString()
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return now.toISOString()
  if (parsed.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
    return now.toISOString()
  }
  return parsed.toISOString()
}

router.post('/', async (req, res) => {
  const { checkpointId, gpsLatitude, gpsLongitude, notes, clientScanId } = req.body

  if (!checkpointId) {
    return res.status(400).json({ message: 'checkpointId is required' })
  }

  // Idempotency key minted on the device when the scan was TAKEN. It survives
  // app restarts, so a queued scan retried after a timeout — where the server
  // may already have recorded it — resolves to the original row instead of
  // duplicating the patrol record.
  const idempotencyKey =
    typeof clientScanId === 'string' && clientScanId.trim()
      ? clientScanId.trim().slice(0, 64)
      : null

  if (idempotencyKey) {
    const replay = await db.get(
      `${SCAN_DETAIL_SELECT} WHERE s.officerId = ? AND s.clientScanId = ?`,
      [req.user.id, idempotencyKey],
    )
    // 200 (not 201) so the client can tell "already recorded" from "created" —
    // both are success, and neither should be retried again.
    if (replay) return res.status(200).json(normalizeScan(replay))
  }

  const checkpointRaw = await db.get('SELECT * FROM checkpoints WHERE id = ?', [checkpointId])
  if (!checkpointRaw) {
    return res.status(404).json({ message: 'Checkpoint not found' })
  }
  const checkpoint = normalizeCheckpoint(checkpointRaw)

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
    // Use the exact geofence radius configured for this checkpoint. (Previously
    // this was capped at Math.min(radius, 10), which ignored any larger radius
    // an admin set and silently forced a 10m fence.)
    const effectiveRadius = checkpoint.radiusMeters
    gpsValid = distanceMeters <= effectiveRadius
  }

  const now = new Date()
  const scan = {
    id: uuidv4(),
    officerId: req.user.id,
    checkpointId,
    clientScanId: idempotencyKey,
    scannedAt: resolveScannedAt(req.body.scannedAt, now),
    // Stamped explicitly rather than left to the column default: the default
    // writes a zone-less local-looking string, and the gap between these two
    // timestamps is exactly what marks a scan as synced late.
    receivedAt: now.toISOString(),
    gpsLatitude: gpsLatitude || null,
    gpsLongitude: gpsLongitude || null,
    gpsValid: gpsValid ? 1 : 0,
    distanceMeters,
    notes: notes || '',
  }

  try {
    await db.run(`
      INSERT INTO scans (id, officerId, checkpointId, clientScanId, scannedAt, receivedAt, gpsLatitude, gpsLongitude, gpsValid, distanceMeters, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, Object.values(scan))
  } catch (error) {
    // Two flushes of the same queued scan can race past the replay check above
    // and collide on the unique index. The row the winner wrote is the answer.
    if (idempotencyKey) {
      const winner = await db.get(
        `${SCAN_DETAIL_SELECT} WHERE s.officerId = ? AND s.clientScanId = ?`,
        [req.user.id, idempotencyKey],
      )
      if (winner) return res.status(200).json(normalizeScan(winner))
    }
    throw error
  }

  // Only once the scan is durably recorded — raising a breach for a scan that
  // then failed to insert (or was a duplicate) would alert on nothing.
  if (!gpsValid && distanceMeters != null) {
    await createIncident(
      req.user.id,
      checkpointId,
      'Geofence Breach',
      `Guard scanned ${checkpoint.name} from ${distanceMeters}m away (radius: ${checkpoint.radiusMeters}m)`,
      'high',
      req.app,
    )
  }

  const fullScan = await db.get(`${SCAN_DETAIL_SELECT} WHERE s.id = ?`, [scan.id])

  const scanResult = normalizeScan(fullScan)

  if (req.app.get('io')) {
    req.app.get('io').emit('scan:new', scanResult)
    // A scan flushed from the offline queue carries where the guard was hours
    // ago. Feeding that to the live map would teleport their marker back and
    // assert they are on duty there right now, so only a fresh scan moves it.
    if (gpsLatitude != null && gpsLongitude != null && !scanResult.syncedLate) {
      req.app.get('io').emit('position:update', {
        userId: req.user.id,
        name: req.user.name,
        latitude: gpsLatitude,
        longitude: gpsLongitude,
        accuracy: null,
        speed: null,
        heading: null,
        capturedAt: scan.scannedAt,
        onDuty: true,
      })
    }
  }

  res.status(201).json(scanResult)
})

router.get('/export/daily', async (req, res) => {
  if (!canExport(req.user.role)) {
    return res.status(403).json({ message: 'Only Admin and Main Account can review exports' })
  }

  try {
    const role = normalizeRole(req.user?.role)
    const params = []
    let where = ''

    if (role === 'main_account') {
      where = 'WHERE ef.clientId = ?'
      params.push(req.user.clientId)
    }

    const rows = await db.all(`
      SELECT ef.*, u.name as requestedByName
      FROM exportFiles ef
      JOIN users u ON ef.requestedBy = u.id
      ${where}
      ORDER BY ef.generatedAt DESC, ef.createdAt DESC
    `, params)

    res.json(rows.map(normalizeExportFile))
  } catch (error) {
    console.error('[scans:export:daily:list]', error)
    res.status(500).json({ message: 'Failed to load export archive' })
  }
})

router.post('/export/daily', async (req, res) => {
  if (!canExport(req.user.role)) {
    return res.status(403).json({ message: 'Only Admin and Main Account can request exports' })
  }

  const { date, format = 'xlsx' } = req.body
  if (!date) {
    return res.status(400).json({ message: 'date is required' })
  }
  if (String(format).toLowerCase() !== 'xlsx') {
    return res.status(400).json({ message: 'Only xlsx export is currently supported' })
  }

  try {
    const { startIso, endIso } = buildDayRange(date)
    const role = normalizeRole(req.user?.role)

    const scanParams = [startIso, endIso]
    let scanWhere = 'WHERE s.scannedAt >= ? AND s.scannedAt <= ?'
    let scopeLabel = 'All clients'

    if (role === 'main_account') {
      scanWhere += ' AND c.clientId = ?'
      scanParams.push(req.user.clientId)
      const client = await db.get('SELECT name FROM clients WHERE id = ?', [req.user.clientId])
      scopeLabel = client?.name || client?.Name || 'Client scope'
    }

    const scans = await db.all(`
      SELECT s.*, u.name as officerName, u.email as officerEmail, u.phone as officerPhone,
             c.name as checkpointName, c.code as checkpointCode, c.clientId, c.siteId,
             sites.name as siteName, clients.name as clientName
      FROM scans s
      JOIN users u ON s.officerId = u.id
      JOIN checkpoints c ON s.checkpointId = c.id
      LEFT JOIN sites ON c.siteId = sites.id
      LEFT JOIN clients ON c.clientId = clients.id
      ${scanWhere}
      ORDER BY s.scannedAt ASC
    `, scanParams)

    const shiftParams = [endIso, startIso]
    let shiftWhere = 'WHERE s.clockIn <= ? AND (s.clockOut IS NULL OR s.clockOut >= ?)'
    if (role === 'main_account') {
      shiftWhere += ' AND u.clientId = ?'
      shiftParams.push(req.user.clientId)
    }

    const shifts = await db.all(`
      SELECT s.*, u.name as userName, u.email as userEmail, u.phone as userPhone,
             u.clientId, clients.name as clientName
      FROM shifts s
      JOIN users u ON s.userId = u.id
      LEFT JOIN clients ON u.clientId = clients.id
      ${shiftWhere}
      ORDER BY s.clockIn ASC
    `, shiftParams)

    const exportFile = await createDailyExportWorkbook({
      date,
      requestedBy: req.user,
      scans,
      shifts,
      scopeLabel,
    })

    const exportRecord = {
      id: uuidv4(),
      type: 'daily_tour',
      date,
      format: 'xlsx',
      status: 'ready',
      scopeLabel,
      clientId: role === 'main_account' ? req.user.clientId : null,
      requestedBy: req.user.id,
      fileName: exportFile.fileName,
      filePath: exportFile.filePath,
      downloadUrl: exportFile.downloadUrl,
      totalsJson: JSON.stringify(exportFile.totals),
      generatedAt: new Date().toISOString(),
    }

    await db.run(`
      INSERT INTO exportFiles (
        id, type, date, format, status, scopeLabel, clientId, requestedBy,
        fileName, filePath, downloadUrl, totalsJson, generatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      exportRecord.id,
      exportRecord.type,
      exportRecord.date,
      exportRecord.format,
      exportRecord.status,
      exportRecord.scopeLabel,
      exportRecord.clientId,
      exportRecord.requestedBy,
      exportRecord.fileName,
      exportRecord.filePath,
      exportRecord.downloadUrl,
      exportRecord.totalsJson,
      exportRecord.generatedAt,
    ])

    const saved = await db.get(`
      SELECT ef.*, u.name as requestedByName
      FROM exportFiles ef
      JOIN users u ON ef.requestedBy = u.id
      WHERE ef.id = ?
    `, [exportRecord.id])

    res.status(201).json(normalizeExportFile(saved))
  } catch (error) {
    console.error('[scans:export:daily]', error)
    const message = error?.message || 'Failed to generate daily export'
    res.status(500).json({ message })
  }
})

export default router
