import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { chatWithNvidia, embedWithNvidia, nvidiaConfigured } from '../services/ai.js'
import { isAdmin, isMainAccount, normalizeRole } from '../utils/roles.js'

const router = Router()
router.use(authMiddleware)

const REPORT_TYPES = [
  'Daily Activity Report',
  'Patrol Summary Report',
  'Clock-In / Clock-Out Report',
  'Attendance Report',
  'Incident Report',
  'Emergency Report',
  'Maintenance Report',
  'Pass-On Log Report',
  'Weekly Report',
  'Monthly Report',
  'Client Summary Report',
]

function isoNow() {
  return new Date().toISOString()
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function startOfDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString()
}

function safeJson(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

function inferIntent(question) {
  const q = question.toLowerCase()
  if (/\b(how many|number of|count|total)\b.*\b(location|locations|checkpoint|checkpoints|site|sites)\b|\b(location|locations|checkpoint|checkpoints|site|sites)\b.*\b(how many|number|count|total)\b/.test(q)) return 'location_count'
  if (/\b(phone|email|contact|details|profile)\b/.test(q)) return 'guard_details'
  if (/\b(on duty|active guard|active guards|currently active|clocked in|clock-in|who is currently|officers?|personnel|guards?|staff|how many)\b/.test(q)) return 'roster'
  if (/\b(report|dar|summary|email|client update|monthly|weekly)\b/.test(q)) return 'report'
  if (/\b(policy|sop|procedure|training|post order|instruction|template)\b/.test(q)) return 'knowledge'
  if (/\b(clock|timesheet|hours|late|overtime|attendance|on duty|clocked)\b/.test(q)) return 'timesheet'
  if (/\b(scan|patrol|checkpoint|missed)\b/.test(q)) return 'patrol'
  if (/\b(geofence|gps|location|radius|outside)\b/.test(q)) return 'geofence'
  if (/\b(pass.?on|handover|handoff)\b/.test(q)) return 'handover'
  if (/\b(alert|risk|emergency|inactivity|suspicious)\b/.test(q)) return 'risk'
  return 'operations'
}

function isRosterQuestion(intent) {
  return intent === 'roster'
}

function isGuardDetailsQuestion(intent) {
  return intent === 'guard_details'
}

function isLocationCountQuestion(intent) {
  return intent === 'location_count'
}

function roleScope(user, aliases = {}) {
  const role = normalizeRole(user?.role)
  const scan = aliases.scan ? `${aliases.scan}.` : ''
  const checkpoint = aliases.checkpoint ? `${aliases.checkpoint}.` : ''
  const subjectUser = aliases.user ? `${aliases.user}.` : ''
  const shift = aliases.shift ? `${aliases.shift}.` : ''
  const conditions = []
  const params = []

  if (role === 'admin') return { conditions, params }

  if (role === 'main_account') {
    if (checkpoint) {
      conditions.push(`${checkpoint}clientId = ?`)
      params.push(user.clientId)
    } else if (subjectUser) {
      conditions.push(`${subjectUser}clientId = ?`)
      params.push(user.clientId)
    }
    return { conditions, params }
  }

  if (role === 'guard') {
    if (scan) conditions.push(`${scan}officerId = ?`)
    else if (shift) conditions.push(`${shift}userId = ?`)
    else if (subjectUser) conditions.push(`${subjectUser}id = ?`)
    params.push(user.id)
    return { conditions, params }
  }

  if (role === 'supervisor') {
    if (checkpoint) {
      conditions.push(`${checkpoint}siteId IN (SELECT siteId FROM user_site_assignments WHERE userId = ?)`)
      params.push(user.id)
    } else if (subjectUser) {
      conditions.push(`${subjectUser}id IN (
        SELECT userId FROM user_site_assignments WHERE siteId IN (
          SELECT siteId FROM user_site_assignments WHERE userId = ?
        )
      )`)
      params.push(user.id)
    } else if (shift) {
      conditions.push(`${shift}userId IN (
        SELECT userId FROM user_site_assignments WHERE siteId IN (
          SELECT siteId FROM user_site_assignments WHERE userId = ?
        )
      )`)
      params.push(user.id)
    }
  }

  return { conditions, params }
}

function appendWhere(baseSql, scope, extra = '') {
  const conditions = [...scope.conditions]
  if (extra) conditions.push(extra)
  if (!conditions.length) return baseSql
  return `${baseSql} WHERE ${conditions.join(' AND ')}`
}

function normalizeRows(rows) {
  return rows.map((row) => {
    const out = {}
    for (const [key, value] of Object.entries(row)) {
      if (key === 'password') continue
      out[key.toLowerCase()] = value
    }
    return out
  })
}

function includeContactDetails(user, targetUserId) {
  const role = normalizeRole(user?.role)
  return role === 'admin' || role === 'main_account' || role === 'supervisor' || user.id === targetUserId
}

function formatTime(value) {
  if (!value) return 'time not recorded'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function getRosterSnapshot(user) {
  const role = normalizeRole(user?.role)
  const sinceToday = startOfToday()

  let guardsSql = `
    SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.clientId
    FROM users u
    WHERE u.role = 'guard'
  `
  const guardParams = []
  if (role === 'main_account') {
    guardsSql += ' AND u.clientId = ?'
    guardParams.push(user.clientId)
  } else if (role === 'guard') {
    guardsSql += ' AND u.id = ?'
    guardParams.push(user.id)
  } else if (role === 'supervisor') {
    guardsSql += ` AND u.id IN (
      SELECT usa.userId FROM user_site_assignments usa
      WHERE usa.siteId IN (
        SELECT supervisorSites.siteId FROM user_site_assignments supervisorSites WHERE supervisorSites.userId = ?
      )
    )`
    guardParams.push(user.id)
  }

  const guards = normalizeRows(await db.all(`${guardsSql} ORDER BY u.name ASC LIMIT 500`, guardParams))
  const guardIds = new Set(guards.map((guard) => guard.id))

  const assignments = normalizeRows(await db.all(`
    SELECT usa.userId, usa.siteId, s.name as siteName, s.location as siteLocation, s.active as siteActive
    FROM user_site_assignments usa
    JOIN sites s ON usa.siteId = s.id
    WHERE usa.userId IN (${guards.length ? guards.map(() => '?').join(',') : "''"})
  `, guards.map((guard) => guard.id)))

  const activeShifts = normalizeRows(await db.all(`
    SELECT sh.id, sh.userId, sh.clockIn, sh.clockOut, sh.status, sh.siteLabel,
      sh.siteLabel as shiftSiteLabel
    FROM shifts sh
    WHERE sh.status = 'active'
      AND sh.userId IN (${guards.length ? guards.map(() => '?').join(',') : "''"})
    ORDER BY sh.clockIn DESC
    LIMIT 300
  `, guards.map((guard) => guard.id)))

  const todayScans = normalizeRows(await db.all(`
    SELECT s.id, s.officerId, s.scannedAt, s.gpsValid, s.distanceMeters,
      c.name as checkpointName, c.siteId, st.name as siteName
    FROM scans s
    JOIN checkpoints c ON s.checkpointId = c.id
    LEFT JOIN sites st ON c.siteId = st.id
    WHERE s.scannedAt >= ?
      AND s.officerId IN (${guards.length ? guards.map(() => '?').join(',') : "''"})
    ORDER BY s.scannedAt DESC
    LIMIT 500
  `, [sinceToday, ...guards.map((guard) => guard.id)]))

  const guardSummaries = guards.map((guard) => {
    const guardAssignments = assignments.filter((assignment) => assignment.userid === guard.id)
    const activeShift = activeShifts.find((shift) => shift.userid === guard.id)
    const lastScan = todayScans.find((scan) => scan.officerid === guard.id)
    const shiftSite = activeShift?.siteslabel || activeShift?.sitelabel || ''
    const assignedSite = guardAssignments[0]
    return {
      id: guard.id,
      name: guard.name,
      activeProfile: !!guard.active,
      phone: includeContactDetails(user, guard.id) ? guard.phone : null,
      email: includeContactDetails(user, guard.id) ? guard.email : null,
      assignedSites: guardAssignments.map((assignment) => ({
        id: assignment.siteid,
        name: assignment.sitename || 'Unknown site',
        location: assignment.sitelocation || '',
        active: !!assignment.siteactive,
      })),
      assignedSiteCount: guardAssignments.length,
      currentlyClockedIn: !!activeShift,
      currentlyOnDuty: !!activeShift && !!guard.active,
      currentShift: activeShift ? {
        id: activeShift.id,
        clockIn: activeShift.clockin,
        clockOut: activeShift.clockout || null,
        status: activeShift.status,
        siteName: shiftSite || assignedSite?.sitename || 'Unknown site',
      } : null,
      patrolScansToday: todayScans.filter((scan) => scan.officerid === guard.id).length,
      lastActivity: lastScan ? {
        type: 'patrol_scan',
        at: lastScan.scannedat,
        checkpointName: lastScan.checkpointname || '',
        siteName: lastScan.sitename || '',
        gpsValid: !!lastScan.gpsvalid,
        distanceMeters: lastScan.distancemeters ?? null,
      } : activeShift ? {
        type: 'clock_in',
        at: activeShift.clockin,
      } : null,
    }
  })

  return {
    checkedAt: isoNow(),
    counts: {
      totalGuardsRegistered: guards.length,
      activeGuardProfiles: guards.filter((guard) => !!guard.active).length,
      guardsAssignedToSites: guardSummaries.filter((guard) => guard.assignedSiteCount > 0).length,
      guardsCurrentlyClockedIn: guardSummaries.filter((guard) => guard.currentlyClockedIn).length,
      guardsCurrentlyOnDuty: guardSummaries.filter((guard) => guard.currentlyOnDuty).length,
      guardsWithPatrolScansToday: guardSummaries.filter((guard) => guard.patrolScansToday > 0).length,
      activeShiftRecords: activeShifts.length,
      patrolScansToday: todayScans.length,
    },
    guards: guardSummaries,
    activeGuards: guardSummaries.filter((guard) => guard.currentlyOnDuty),
    dataValidation: {
      tablesChecked: ['users', 'shifts', 'user_site_assignments', 'sites', 'scans'],
      missingData: [
        ...(guards.length === 0 ? ['No guard records matched the current user access scope.'] : []),
        ...guardSummaries
          .filter((guard) => guard.currentlyOnDuty && guard.currentShift?.siteName === 'Unknown site')
          .map((guard) => `${guard.name} has an active shift but no resolved site assignment.`),
      ],
    },
  }
}

function buildRosterAnswer(snapshot) {
  const counts = snapshot.counts
  const lines = [
    `There are ${counts.totalGuardsRegistered} guards registered in the system, ${counts.guardsAssignedToSites} assigned to at least one site, and ${counts.guardsCurrentlyOnDuty} currently active/on duty.`,
    `${counts.guardsWithPatrolScansToday} guard${counts.guardsWithPatrolScansToday === 1 ? ' has' : 's have'} patrol scans recorded today.`,
  ]

  if (snapshot.activeGuards.length) {
    lines.push('')
    lines.push('Currently on duty:')
    for (const guard of snapshot.activeGuards) {
      const shift = guard.currentShift
      const last = guard.lastActivity
      lines.push(`- ${guard.name} — ${shift?.siteName || 'Unknown site'}; clocked in ${formatTime(shift?.clockIn)}; status: ${shift?.status || 'active'}; last activity: ${
        last?.type === 'patrol_scan'
          ? `patrol scan at ${formatTime(last.at)}${last.checkpointName ? ` (${last.checkpointName})` : ''}${last.gpsValid === false ? ' (GPS flagged)' : ''}`
          : `clock-in at ${formatTime(last?.at || shift?.clockIn)}`
      }.`)
    }
  } else {
    lines.push('')
    lines.push('I checked guard profiles, active shift records, site assignments, and today’s patrol scans. I did not find an active shift for any scoped guard.')
  }

  if (snapshot.dataValidation.missingData.length) {
    lines.push('')
    lines.push(`Data note: ${snapshot.dataValidation.missingData.join(' ')}`)
  }

  return lines.join('\n')
}

function buildGuardDetailsAnswer(snapshot, question) {
  const q = question.toLowerCase()
  const matched =
    snapshot.guards.find((guard) => q.includes(String(guard.name || '').toLowerCase())) ||
    (snapshot.activeGuards.length === 1 ? snapshot.activeGuards[0] : null)

  if (!matched) {
    return 'I could not identify which guard you mean from the verified records. Please give me the guard name.'
  }

  const shift = matched.currentShift
  const assignedSites = matched.assignedSites.length
    ? matched.assignedSites.map((site) => site.name).join(', ')
    : 'No resolved site assignment'

  return [
    matched.name,
    `Phone: ${matched.phone || 'not recorded'}`,
    `Email: ${matched.email || 'not recorded'}`,
    `Current status: ${matched.currentlyOnDuty ? 'active/on duty' : matched.activeProfile ? 'active profile, not on duty' : 'inactive profile'}`,
    `Assigned site: ${shift?.siteName || assignedSites}`,
    `Clock-in: ${shift?.clockIn ? formatTime(shift.clockIn) : 'not currently clocked in'}`,
  ].join('\n')
}

async function getLocationSnapshot(user) {
  const role = normalizeRole(user?.role)
  const conditions = []
  const params = []
  if (role === 'main_account') {
    conditions.push('c.clientId = ?')
    params.push(user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    conditions.push('c.siteId IN (SELECT siteId FROM user_site_assignments WHERE userId = ?)')
    params.push(user.id)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const checkpoints = normalizeRows(await db.all(`
    SELECT c.id, c.name, c.code, c.active, c.siteId, s.name as siteName
    FROM checkpoints c
    LEFT JOIN sites s ON c.siteId = s.id
    ${where}
    ORDER BY c.name ASC
    LIMIT 1000
  `, params))
  const sites = normalizeRows(await db.all(`
    SELECT s.id, s.name, s.location, s.active
    FROM sites s
    ${role === 'main_account' ? 'WHERE s.clientId = ?' : role === 'supervisor' || role === 'guard' ? 'WHERE s.id IN (SELECT siteId FROM user_site_assignments WHERE userId = ?)' : ''}
    ORDER BY s.name ASC
    LIMIT 1000
  `, role === 'main_account' ? [user.clientId] : role === 'supervisor' || role === 'guard' ? [user.id] : []))
  return { checkpoints, sites }
}

function buildLocationCountAnswer(snapshot) {
  const checkpoints = snapshot.checkpoints || []
  const sites = snapshot.sites || []
  const active = checkpoints.filter((checkpoint) => !!checkpoint.active).length
  return [
    `There are ${checkpoints.length} checkpoints in the system right now.`,
    `${active} are active and ${checkpoints.length - active} are inactive.`,
    `There are ${sites.length} locations/sites in scope.`,
    checkpoints.length ? `Checkpoints: ${checkpoints.slice(0, 8).map((checkpoint) => checkpoint.sitename ? `${checkpoint.name} (${checkpoint.sitename})` : checkpoint.name).join(', ')}${checkpoints.length > 8 ? ', ...' : ''}` : 'No checkpoint records matched your access scope.',
  ].join('\n')
}

async function enforceAiRateLimit(userId) {
  const minuteKey = `minute:${new Date().toISOString().slice(0, 16)}`
  const dayKey = `day:${new Date().toISOString().slice(0, 10)}`
  const limits = [
    { key: minuteKey, max: Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 8) },
    { key: dayKey, max: Number(process.env.AI_RATE_LIMIT_PER_DAY || 120) },
  ]

  for (const limit of limits) {
    const existing = await db.get('SELECT * FROM aiRateLimits WHERE userId = ? AND windowKey = ?', [userId, limit.key])
    const count = Number(existing?.count || 0)
    if (count >= limit.max) {
      const err = new Error('AI usage limit reached. Please wait before asking another question.')
      err.status = 429
      throw err
    }
    if (existing) {
      await db.run('UPDATE aiRateLimits SET count = ?, updatedAt = ? WHERE userId = ? AND windowKey = ?', [
        count + 1,
        isoNow(),
        userId,
        limit.key,
      ])
    } else {
      await db.run('INSERT INTO aiRateLimits (id, userId, windowKey, count, updatedAt) VALUES (?, ?, ?, ?, ?)', [
        uuidv4(),
        userId,
        limit.key,
        1,
        isoNow(),
      ])
    }
  }
}

async function audit({ user, question, intent, dataSources, sensitive = false, status = 'completed', error = '' }) {
  await db.run(`
    INSERT INTO aiAuditLogs (id, userId, userRole, question, intent, dataSources, sensitive, status, error, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    uuidv4(),
    user.id,
    normalizeRole(user.role),
    question,
    intent,
    safeJson(dataSources),
    sensitive ? 1 : 0,
    status,
    error,
    isoNow(),
  ])
}

async function getOperationalContext(user, intent) {
  const sinceToday = startOfToday()
  const sinceWeek = startOfDaysAgo(7)
  const context = {}
  const sources = []

  const scanScope = roleScope(user, { scan: 's', checkpoint: 'c' })
  const scansSql = appendWhere(`
    SELECT s.id, s.officerId, u.name as officerName, c.id as checkpointId, c.name as checkpointName,
      c.code as checkpointCode, c.siteId, c.clientId, c.latitude as checkpointLatitude,
      c.longitude as checkpointLongitude, c.radiusMeters, c.expectedIntervalMinutes,
      s.scannedAt, s.receivedAt, s.gpsLatitude, s.gpsLongitude, s.gpsValid, s.distanceMeters, s.notes
    FROM scans s
    JOIN users u ON s.officerId = u.id
    JOIN checkpoints c ON s.checkpointId = c.id
  `, scanScope, 's.scannedAt >= ?')
  context.recentScans = normalizeRows(await db.all(`${scansSql} ORDER BY s.scannedAt DESC LIMIT 80`, [...scanScope.params, sinceWeek]))
  sources.push('recent patrol scans')

  const shiftScope = roleScope(user, { shift: 'sh', user: 'u' })
  const shiftSql = appendWhere(`
    SELECT sh.id, sh.userId, u.name as userName, u.email as userEmail, u.phone as userPhone,
      sh.clockIn, sh.clockOut, sh.status, sh.clockInLatitude, sh.clockInLongitude,
      sh.clockOutLatitude, sh.clockOutLongitude, sh.scheduledStart, sh.scheduledEnd, sh.siteLabel
    FROM shifts sh
    JOIN users u ON sh.userId = u.id
  `, shiftScope, 'sh.clockIn >= ?')
  const shifts = normalizeRows(await db.all(`${shiftSql} ORDER BY sh.clockIn DESC LIMIT 80`, [...shiftScope.params, sinceWeek]))
  context.recentShifts = shifts.map((shift) => {
    if (includeContactDetails(user, shift.userid)) return shift
    const { useremail, userphone, ...safeShift } = shift
    return safeShift
  })
  context.activeShifts = context.recentShifts.filter((shift) => shift.status === 'active' || !shift.clockout)
  sources.push('clock-in and timesheet records')

  const incidentScope = roleScope(user, { checkpoint: 'c', user: 'u' })
  const incidentSql = appendWhere(`
    SELECT i.id, i.officerId, u.name as officerName, c.name as checkpointName, c.siteId,
      c.clientId, i.title, i.description, i.severity, i.status, i.reportedAt, i.resolvedAt
    FROM incidents i
    JOIN users u ON i.officerId = u.id
    LEFT JOIN checkpoints c ON i.checkpointId = c.id
  `, incidentScope, 'i.reportedAt >= ?')
  context.recentIncidents = normalizeRows(await db.all(`${incidentSql} ORDER BY i.reportedAt DESC LIMIT 50`, [...incidentScope.params, sinceWeek]))
  sources.push('incident reports')

  const passScope = roleScope(user, { checkpoint: 'c' })
  const passSql = appendWhere(`
    SELECT pl.id, pl.title, pl.instruction, pl.priority, pl.siteLabel, pl.checkpointId,
      c.name as checkpointName, c.siteId, c.clientId, u.name as createdByName, pl.createdAt, pl.active
    FROM passOnLogs pl
    JOIN users u ON pl.createdBy = u.id
    LEFT JOIN checkpoints c ON pl.checkpointId = c.id
  `, passScope, 'pl.createdAt >= ?')
  context.passOnLogs = normalizeRows(await db.all(`${passSql} ORDER BY pl.createdAt DESC LIMIT 40`, [...passScope.params, sinceWeek]))
  sources.push('pass-on logs')

  const handoverScope = roleScope(user, { checkpoint: 'c' })
  const handoverSql = appendWhere(`
    SELECT h.id, h.siteLabel, h.summary, h.openIssues, h.equipmentStatus, h.status,
      h.createdAt, h.acceptedAt, c.name as checkpointName, c.siteId, c.clientId,
      fromUser.name as fromUserName, toUser.name as toUserName
    FROM handovers h
    LEFT JOIN checkpoints c ON h.checkpointId = c.id
    JOIN users fromUser ON h.fromUserId = fromUser.id
    LEFT JOIN users toUser ON h.toUserId = toUser.id
  `, handoverScope, 'h.createdAt >= ?')
  context.handovers = normalizeRows(await db.all(`${handoverSql} ORDER BY h.createdAt DESC LIMIT 40`, [...handoverScope.params, sinceWeek]))
  sources.push('handovers')

  if (intent === 'operations' || intent === 'risk' || intent === 'report') {
    const checkpointScope = roleScope(user, { checkpoint: 'c' })
    const checkpointSql = appendWhere(`
      SELECT c.id, c.name, c.code, c.siteId, c.clientId, c.latitude, c.longitude,
        c.radiusMeters, c.expectedIntervalMinutes, c.active, si.name as siteName, cl.name as clientName
      FROM checkpoints c
      LEFT JOIN sites si ON c.siteId = si.id
      LEFT JOIN clients cl ON c.clientId = cl.id
    `, checkpointScope, 'c.active = 1')
    context.checkpoints = normalizeRows(await db.all(`${checkpointSql} ORDER BY c.name ASC LIMIT 120`, checkpointScope.params))
    sources.push('checkpoint and site records')
  }

  context.today = {
    startedAt: sinceToday,
    scans: context.recentScans.filter((scan) => scan.scannedat >= sinceToday).length,
    activeGuards: context.activeShifts.length,
    incidents: context.recentIncidents.filter((incident) => incident.reportedat >= sinceToday).length,
  }

  return { context, sources }
}

function tokenize(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2)
}

function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0
  let left = 0
  let right = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    left += a[i] * a[i]
    right += b[i] * b[i]
  }
  return left && right ? dot / (Math.sqrt(left) * Math.sqrt(right)) : 0
}

async function retrieveKnowledge(question, user) {
  const role = normalizeRole(user.role)
  const conditions = []
  const params = []
  if (role === 'main_account') {
    conditions.push('(kd.clientId = ? OR kd.siteId IN (SELECT id FROM sites WHERE clientId = ?))')
    params.push(user.clientId, user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    conditions.push('(kd.siteId IN (SELECT siteId FROM user_site_assignments WHERE userId = ?) OR kd.uploadedBy = ?)')
    params.push(user.id, user.id)
  }
  const sql = `
    SELECT kc.id, kc.content, kc.embeddingJson, kd.title, kd.type, kd.siteId, kd.clientId
    FROM aiKnowledgeChunks kc
    JOIN aiKnowledgeDocuments kd ON kc.documentId = kd.id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
  `

  const rows = await db.all(`${sql} ORDER BY kc.createdAt DESC LIMIT 200`, params)
  if (!rows.length) return []

  let queryEmbedding = null
  if (nvidiaConfigured()) {
    try {
      const embedded = await embedWithNvidia([question])
      queryEmbedding = embedded.embeddings?.[0] || null
    } catch {
      queryEmbedding = null
    }
  }

  const words = new Set(tokenize(question))
  const ranked = rows.map((row) => {
    let vectorScore = 0
    if (queryEmbedding) {
      try {
        vectorScore = cosine(queryEmbedding, JSON.parse(row.embeddingJson || row.embeddingjson || '[]'))
      } catch {
        vectorScore = 0
      }
    }
    const textWords = tokenize(row.content)
    const keywordScore = textWords.filter((word) => words.has(word)).length / Math.max(1, words.size)
    return {
      title: row.title,
      type: row.type,
      content: row.content,
      score: vectorScore || keywordScore,
    }
  }).sort((a, b) => b.score - a.score)

  return ranked.filter((row) => row.score > 0).slice(0, 6)
}

function fallbackAnswer({ question, context, knowledge, unavailable }) {
  if (unavailable) {
    return 'The AI assistant is temporarily unavailable because the NVIDIA key is not configured on the server. I have gathered the verified operational data, but I will not guess or generate an answer without the approved AI provider.'
  }
  if (!context && !knowledge?.length) {
    return `I could not find verified system data for that request: "${question}". Please narrow the question by guard, site, date, or report type.`
  }
  return 'I found verified records for this request, but the AI provider did not return a usable response. Please try again in a moment.'
}

function buildSystemPrompt(user) {
  return `You are the AI Operations Assistant for Evergreen / Patrol Security.
Speak like a professional control-room assistant advising a supervisor.
Only answer from the verified JSON data and retrieved document context provided in this request.
Never invent patrol scans, guard names, clock-in times, incident reports, GPS data, locations, clients, or policies.
If the verified data does not answer the question, say exactly what is missing and ask for a narrower date, guard, site, or report type.
Respect access control. The caller role is ${normalizeRole(user.role)}. Do not expose phone numbers or emails unless they are present in the verified data.
Keep answers concise, natural, and operationally useful. Mention timestamps, site names, checkpoint names, GPS/geofence status, and unresolved risks when available.
Do not use markdown tables, ### headings, **bold**, or long formatting unless the user explicitly asks for a report.
For reports, use a polished report format with clear sections, verified totals, and a short operational summary.`
}

function reportTypeFromQuestion(question) {
  const q = question.toLowerCase()
  return REPORT_TYPES.find((type) => q.includes(type.toLowerCase().replace(/\s*\/\s*/g, ' '))) || (
    q.includes('weekly') ? 'Weekly Report' :
    q.includes('monthly') ? 'Monthly Report' :
    q.includes('incident') ? 'Incident Report' :
    q.includes('attendance') ? 'Attendance Report' :
    q.includes('clock') ? 'Clock-In / Clock-Out Report' :
    q.includes('pass') ? 'Pass-On Log Report' :
    q.includes('client') ? 'Client Summary Report' :
    'Daily Activity Report'
  )
}

router.post('/chat', async (req, res) => {
  const question = String(req.body?.message || '').trim()
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : []
  if (!question) return res.status(400).json({ message: 'message is required' })

  const intent = inferIntent(question)
  const sensitive = /\b(phone|email|contact|number|address)\b/i.test(question)

  try {
    await enforceAiRateLimit(req.user.id)

    const [{ context, sources }, knowledge] = await Promise.all([
      getOperationalContext(req.user, intent),
      retrieveKnowledge(question, req.user),
    ])

    if (isRosterQuestion(intent) || isGuardDetailsQuestion(intent)) {
      const rosterSnapshot = await getRosterSnapshot(req.user)
      const answer = isGuardDetailsQuestion(intent)
        ? buildGuardDetailsAnswer(rosterSnapshot, question)
        : buildRosterAnswer(rosterSnapshot)
      const rosterSources = ['users', 'shifts', 'user_site_assignments', 'sites', 'scans']
      await audit({
        user: req.user,
        question,
        intent,
        dataSources: rosterSources,
        sensitive,
        status: 'completed',
      })
      return res.json({
        answer,
        intent,
        model: null,
        assistantUnavailable: false,
        generatedReportId: null,
        sources: rosterSources,
        counts: rosterSnapshot.counts,
        validation: rosterSnapshot.dataValidation,
      })
    }

    if (isLocationCountQuestion(intent)) {
      const locationSnapshot = await getLocationSnapshot(req.user)
      const answer = buildLocationCountAnswer(locationSnapshot)
      const locationSources = ['sites', 'checkpoints']
      await audit({
        user: req.user,
        question,
        intent,
        dataSources: locationSources,
        sensitive,
        status: 'completed',
      })
      return res.json({
        answer,
        intent,
        model: null,
        assistantUnavailable: false,
        generatedReportId: null,
        sources: locationSources,
      })
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(req.user) },
      ...history
        .filter((item) => ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
        .map((item) => ({ role: item.role, content: item.content.slice(0, 1200) })),
      {
        role: 'user',
        content: JSON.stringify({
          question,
          intent,
          verifiedOperationalData: context,
          retrievedDocuments: knowledge,
          requiredReportTypes: REPORT_TYPES,
        }),
      },
    ]

    let result
    try {
      result = await chatWithNvidia({ messages, maxTokens: 4096 })
    } catch (error) {
      result = { content: fallbackAnswer({ question, context, knowledge }), error }
    }

    const answer = result.unavailable
      ? fallbackAnswer({ question, context, knowledge, unavailable: true })
      : (result.content || fallbackAnswer({ question, context, knowledge }))

    let generatedReportId = null
    if (intent === 'report' && !result.unavailable && answer) {
      generatedReportId = uuidv4()
      await db.run(`
        INSERT INTO aiGeneratedReports (id, userId, reportType, title, content, sourceSummary, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        generatedReportId,
        req.user.id,
        reportTypeFromQuestion(question),
        `${reportTypeFromQuestion(question)} - ${new Date().toLocaleDateString()}`,
        answer,
        safeJson({ sources, recordCounts: Object.fromEntries(Object.entries(context).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])) }),
        'draft',
        isoNow(),
      ])
    }

    await audit({
      user: req.user,
      question,
      intent,
      dataSources: [...sources, ...(knowledge.length ? ['RAG document chunks'] : [])],
      sensitive,
      status: result.error ? 'provider_error' : 'completed',
      error: result.error?.message || '',
    })

    res.json({
      answer,
      intent,
      model: result.model || null,
      assistantUnavailable: !!result.unavailable,
      generatedReportId,
      sources: [...sources, ...(knowledge.length ? ['RAG document chunks'] : [])],
    })
  } catch (error) {
    await audit({
      user: req.user,
      question,
      intent,
      dataSources: [],
      sensitive,
      status: 'failed',
      error: error.message,
    }).catch(() => {})
    res.status(error.status || 500).json({
      message: error.status === 429
        ? error.message
        : 'The AI assistant is unavailable right now. Please try again shortly.',
    })
  }
})

router.get('/reports', async (req, res) => {
  const role = normalizeRole(req.user?.role)
  const conditions = []
  const params = []
  if (role !== 'admin') {
    conditions.push('userId = ?')
    params.push(req.user.id)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const reports = await db.all(`SELECT * FROM aiGeneratedReports ${where} ORDER BY createdAt DESC LIMIT 50`, params)
  res.json(reports)
})

router.post('/knowledge', async (req, res) => {
  if (!isAdmin(req.user?.role) && !isMainAccount(req.user?.role) && !isSupervisor(req.user?.role)) {
    return res.status(403).json({ message: 'Only operations leadership can add AI knowledge documents.' })
  }

  const title = String(req.body?.title || '').trim()
  const content = String(req.body?.content || '').trim()
  const type = String(req.body?.type || 'document').trim()
  const siteId = req.body?.siteId || null
  const clientId = isAdmin(req.user?.role) ? (req.body?.clientId || null) : (req.user.clientId || null)

  if (!title || !content) {
    return res.status(400).json({ message: 'title and content are required' })
  }

  const documentId = uuidv4()
  await db.run(`
    INSERT INTO aiKnowledgeDocuments (id, title, type, siteId, clientId, uploadedBy, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [documentId, title, type, siteId, clientId, req.user.id, isoNow()])

  const chunks = content.match(/[\s\S]{1,1600}(?=\s|$)/g) || [content]
  let embeddings = []
  let embeddingModel = ''
  if (nvidiaConfigured()) {
    try {
      const embedded = await embedWithNvidia(chunks)
      embeddings = embedded.embeddings || []
      embeddingModel = embedded.model || ''
    } catch {
      embeddings = []
    }
  }

  for (let i = 0; i < chunks.length; i += 1) {
    await db.run(`
      INSERT INTO aiKnowledgeChunks (id, documentId, chunkIndex, content, embeddingJson, embeddingModel, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      documentId,
      i,
      chunks[i].trim(),
      safeJson(embeddings[i] || []),
      embeddingModel,
      isoNow(),
    ])
  }

  await audit({
    user: req.user,
    question: `Uploaded AI knowledge document: ${title}`,
    intent: 'knowledge_ingestion',
    dataSources: ['aiKnowledgeDocuments', 'aiKnowledgeChunks'],
    sensitive: false,
  })

  res.status(201).json({ id: documentId, title, chunks: chunks.length, embedded: embeddings.length > 0 })
})

router.get('/architecture', async (_req, res) => {
  res.json({
    provider: {
      name: 'NVIDIA NIM Chat Completions',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKeyEnv: 'NVIDIA_API_KEY',
      defaultChatModel: process.env.NVIDIA_CHAT_MODEL || 'openai/gpt-oss-120b',
    },
    liveData: ['shifts', 'scans', 'checkpoints', 'incidents', 'passOnLogs', 'handovers', 'sites', 'clients'],
    ragTables: ['aiKnowledgeDocuments', 'aiKnowledgeChunks'],
    auditTables: ['aiAuditLogs', 'aiRateLimits', 'aiGeneratedReports', 'aiClientEmails'],
    reportTypes: REPORT_TYPES,
  })
})

export default router
