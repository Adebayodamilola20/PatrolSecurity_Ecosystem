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
  if (/\b(report|dar|summary|email|client update|monthly|weekly)\b/.test(q)) return 'report'
  if (/\b(policy|sop|procedure|training|post order|instruction|template)\b/.test(q)) return 'knowledge'
  if (/\b(clock|timesheet|hours|late|overtime|attendance|on duty|clocked)\b/.test(q)) return 'timesheet'
  if (/\b(scan|patrol|checkpoint|missed)\b/.test(q)) return 'patrol'
  if (/\b(geofence|gps|location|radius|outside)\b/.test(q)) return 'geofence'
  if (/\b(pass.?on|handover|handoff)\b/.test(q)) return 'handover'
  if (/\b(alert|risk|emergency|inactivity|suspicious)\b/.test(q)) return 'risk'
  return 'operations'
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
