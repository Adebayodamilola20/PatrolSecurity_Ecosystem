import { Router } from 'express'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.get('/', (req, res) => {
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

  const shifts = db.prepare(`
    SELECT s.*, u.name as userName, u.email as userEmail, u.phone as userPhone
    FROM shifts s
    JOIN users u ON s.userId = u.id
    ${where}
    ORDER BY s.clockIn DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset))

  const result = shifts.map((s) => {
    const clockIn = new Date(s.clockIn).getTime()
    const clockOut = s.clockOut ? new Date(s.clockOut).getTime() : Date.now()
    const durationMs = clockOut - clockIn
    const hours = Math.floor(durationMs / 3600000)
    const minutes = Math.floor((durationMs % 3600000) / 60000)

    const scans = db.prepare(`
      SELECT s.*, c.name as checkpointName, c.code as checkpointCode
      FROM scans s
      JOIN checkpoints c ON s.checkpointId = c.id
      WHERE s.officerId = ? AND s.scannedAt >= ? AND (s.scannedAt <= ? OR ? IS NULL)
      ORDER BY s.scannedAt ASC
    `).all(s.userId, s.clockIn, s.clockOut, s.clockOut)

    return {
      shiftId: s.id,
      userId: s.userId,
      userName: s.userName,
      userEmail: s.userEmail,
      userPhone: s.userPhone,
      clockIn: s.clockIn,
      clockOut: s.clockOut,
      duration: `${hours}h ${minutes}m`,
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
  })

  res.json(result)
})

router.get('/summary', (req, res) => {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  const weekAgo = new Date(today.getTime() - 7 * 86400000).toISOString()

  const shifts = db.prepare(`
    SELECT s.*, u.name as userName FROM shifts s
    JOIN users u ON s.userId = u.id
    WHERE s.clockIn >= ?
    ORDER BY s.clockIn ASC
  `).all(weekAgo)

  const totalHours = shifts.reduce((acc, s) => {
    if (!s.clockOut) return acc
    return acc + (new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime())
  }, 0)

  const todayShifts = shifts.filter(s => s.clockIn >= todayStart)

  const byUser = {}
  for (const s of shifts) {
    if (!byUser[s.userId]) byUser[s.userId] = { name: s.userName, shifts: 0, hours: 0 }
    byUser[s.userId].shifts++
    if (s.clockOut) {
      byUser[s.userId].hours += (new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime()) / 3600000
    }
  }

  res.json({
    totalShifts: shifts.length,
    todayShifts: todayShifts.length,
    activeShifts: shifts.filter(s => s.status === 'active').length,
    totalHours: Math.round(totalHours / 3600000 * 10) / 10,
    byUser: Object.entries(byUser).map(([id, data]) => ({ userId: id, ...data, hours: Math.round(data.hours * 10) / 10 })),
  })
})

export default router
