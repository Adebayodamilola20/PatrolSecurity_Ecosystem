import { Router } from 'express'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

function normalizeShiftRow(shift) {
  if (!shift) return shift
  return {
    id: shift.id,
    userId: shift.userId ?? shift.userid ?? '',
    userName: shift.userName ?? shift.username ?? '',
    userEmail: shift.userEmail ?? shift.useremail ?? '',
    userPhone: shift.userPhone ?? shift.userphone ?? '',
    clockIn: shift.clockIn ?? shift.clockin ?? null,
    clockOut: shift.clockOut ?? shift.clockout ?? null,
    clockInPhoto: shift.clockInPhoto ?? shift.clockinphoto ?? '',
    clockInLatitude: shift.clockInLatitude ?? shift.clockinlatitude ?? null,
    clockInLongitude: shift.clockInLongitude ?? shift.clockinlongitude ?? null,
    clockOutLatitude: shift.clockOutLatitude ?? shift.clockoutlatitude ?? null,
    clockOutLongitude: shift.clockOutLongitude ?? shift.clockoutlongitude ?? null,
    scheduledStart: shift.scheduledStart ?? shift.scheduledstart ?? null,
    scheduledEnd: shift.scheduledEnd ?? shift.scheduledend ?? null,
    status: shift.status ?? 'completed',
  }
}

function normalizeScanRow(scan) {
  if (!scan) return scan
  return {
    id: scan.id,
    checkpointName: scan.checkpointName ?? scan.checkpointname ?? '',
    checkpointCode: scan.checkpointCode ?? scan.checkpointcode ?? '',
    scannedAt: scan.scannedAt ?? scan.scannedat ?? null,
    gpsValid: !!(scan.gpsValid ?? scan.gpsvalid),
    distanceMeters: scan.distanceMeters ?? scan.distancemeters ?? null,
    checkpointActive: !!(scan.checkpointActive ?? scan.checkpointactive),
    scheduledTimeIn: scan.scheduledTimeIn ?? scan.scheduledtimein ?? '',
    scheduledTimeOut: scan.scheduledTimeOut ?? scan.scheduledtimeout ?? '',
  }
}

function formatDuration(clockIn, clockOut) {
  if (!clockIn) return '—'
  const start = new Date(clockIn).getTime()
  const end = new Date(clockOut || new Date().toISOString()).getTime()
  const durationMs = Math.max(0, end - start)
  const hours = Math.floor(durationMs / 3600000)
  const minutes = Math.floor((durationMs % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

router.get('/', async (req, res) => {
  try {
    const { officer, start, end, limit = 50, offset = 0 } = req.query

    const conditions = []
    const params = []

    if (officer) {
      conditions.push('s.userId = ?')
      params.push(officer)
    }
    if (start) {
      conditions.push('s.clockIn >= ?')
      params.push(start)
    }
    if (end) {
      conditions.push('(s.clockOut IS NULL OR s.clockOut <= ?)')
      params.push(end)
    }
    if (req.user.role === 'officer') {
      conditions.push('s.userId = ?')
      params.push(req.user.id)
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    const shifts = await db.all(`
      SELECT s.*, u.name as userName, u.email as userEmail, u.phone as userPhone
      FROM shifts s
      JOIN users u ON s.userId = u.id
      ${where}
      ORDER BY s.clockIn DESC LIMIT ? OFFSET ?
    `, [...params, Number(limit), Number(offset)])

    const result = await Promise.all(shifts.map(async (rawShift) => {
      const s = normalizeShiftRow(rawShift)
      const clockIn = s.clockIn ? new Date(s.clockIn).getTime() : Date.now()
      const clockOut = s.clockOut ? new Date(s.clockOut).getTime() : Date.now()
      const durationMs = Math.max(0, clockOut - clockIn)
      const scanParams = [s.userId, s.clockIn]
      let scanQuery = `
        SELECT s.*, c.name as checkpointName, c.code as checkpointCode, c.active as checkpointActive,
               c.scheduledTimeIn as scheduledTimeIn, c.scheduledTimeOut as scheduledTimeOut
        FROM scans s
        JOIN checkpoints c ON s.checkpointId = c.id
        WHERE s.officerId = ? AND s.scannedAt >= ?
      `
      if (s.clockOut) {
        scanQuery += ' AND s.scannedAt <= ?'
        scanParams.push(s.clockOut)
      }
      scanQuery += ' ORDER BY s.scannedAt ASC'

      const scansRaw = await db.all(scanQuery, scanParams)
      const scans = scansRaw.map(normalizeScanRow)

      return {
        shiftId: s.id,
        userId: s.userId,
        userName: s.userName,
        userEmail: s.userEmail,
        userPhone: s.userPhone,
        clockIn: s.clockIn,
        clockOut: s.clockOut,
        duration: formatDuration(s.clockIn, s.clockOut),
        durationMinutes: Math.round(durationMs / 60000),
        clockInPhoto: s.clockInPhoto || '',
        clockInLatitude: s.clockInLatitude,
        clockInLongitude: s.clockInLongitude,
        clockOutLatitude: s.clockOutLatitude,
        clockOutLongitude: s.clockOutLongitude,
        status: s.status,
        scans,
        scanCount: scans.length,
        verifiedScans: scans.filter(sc => sc.gpsValid).length,
      }
    }))

    res.json(result)
  } catch (error) {
    console.error('[timesheets:list]', error)
    res.status(500).json({ message: 'Could not load timesheets right now.' })
  }
})

router.get('/summary', async (req, res) => {
  try {
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const weekAgo = new Date(today.getTime() - 7 * 86400000).toISOString()

    const shiftsRaw = await db.all(`
      SELECT s.*, u.name as userName FROM shifts s
      JOIN users u ON s.userId = u.id
      WHERE s.clockIn >= ?
      ORDER BY s.clockIn ASC
    `, [weekAgo])
    const shifts = shiftsRaw.map(normalizeShiftRow)

    const totalHours = shifts.reduce((acc, s) => {
      if (!s.clockOut) return acc
      return acc + Math.max(0, new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime())
    }, 0)

    const todayShifts = shifts.filter(s => s.clockIn >= todayStart)

    const byUser = {}
    for (const s of shifts) {
      if (!byUser[s.userId]) byUser[s.userId] = { name: s.userName, shifts: 0, hours: 0 }
      byUser[s.userId].shifts++
      if (s.clockOut) {
        byUser[s.userId].hours += Math.max(0, new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime()) / 3600000
      }
    }

    res.json({
      totalShifts: shifts.length,
      todayShifts: todayShifts.length,
      activeShifts: shifts.filter(s => s.status === 'active').length,
      totalHours: Math.round(totalHours / 3600000 * 10) / 10,
      byUser: Object.entries(byUser).map(([id, data]) => ({ userId: id, ...data, hours: Math.round(data.hours * 10) / 10 })),
    })
  } catch (error) {
    console.error('[timesheets:summary]', error)
    res.status(500).json({ message: 'Could not load timesheet summary right now.' })
  }
})

export default router
