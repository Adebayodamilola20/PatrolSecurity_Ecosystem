import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly, adminOrMainAccountOnly } from '../middleware/auth.js'
import { normalizeRole } from '../utils/roles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(__dirname, '..', 'uploads', 'post-order-proofs')
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg'
    cb(null, `${Date.now()}-${uuidv4()}${ext}`)
  },
})

const upload = multer({ storage })
const router = Router()

router.use(authMiddleware)

function normalizeOrder(row) {
  if (!row) return row
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? '',
    instructions: row.instructions ?? '',
    checkpointId: row.checkpointId ?? row.checkpointid ?? null,
    checkpointName: row.checkpointName ?? row.checkpointname ?? null,
    assignedUserId: row.assignedUserId ?? row.assigneduserid ?? null,
    assignedUserName: row.assignedUserName ?? row.assignedusername ?? null,
    assignedRole: row.assignedRole ?? row.assignedrole ?? 'guard',
    priority: row.priority ?? 'normal',
    active: !!(row.active ?? row.active === 1),
    requiresAcknowledgement: !!(row.requiresAcknowledgement ?? row.requiresacknowledgement ?? false),
    requiresPhotoProof: !!(row.requiresPhotoProof ?? row.requiresphotoproof ?? true),
    createdBy: row.createdBy ?? row.createdby ?? '',
    createdByName: row.createdByName ?? row.createdbyname ?? '',
    createdAt: row.createdAt ?? row.createdat ?? null,
  }
}

function normalizeCompletion(row) {
  if (!row) return row
  return {
    id: row.id,
    postOrderId: row.postOrderId ?? row.postorderid ?? '',
    userId: row.userId ?? row.userid ?? '',
    userName: row.userName ?? row.username ?? '',
    shiftId: row.shiftId ?? row.shiftid ?? null,
    checkpointId: row.checkpointId ?? row.checkpointid ?? null,
    checkpointName: row.checkpointName ?? row.checkpointname ?? null,
    status: row.status ?? 'completed',
    acknowledgedAt: row.acknowledgedAt ?? row.acknowledgedat ?? null,
    completedAt: row.completedAt ?? row.completedat ?? null,
    proofPhotoUrl: row.proofPhotoUrl ?? row.proofphotourl ?? '',
    proofNote: row.proofNote ?? row.proofnote ?? '',
    proofGpsLatitude: row.proofGpsLatitude ?? row.proofgpslatitude ?? null,
    proofGpsLongitude: row.proofGpsLongitude ?? row.proofgpslongitude ?? null,
    reviewStatus: row.reviewStatus ?? row.reviewstatus ?? 'pending',
    reviewedBy: row.reviewedBy ?? row.reviewedby ?? null,
    reviewedAt: row.reviewedAt ?? row.reviewedat ?? null,
    reviewNote: row.reviewNote ?? row.reviewnote ?? '',
    createdAt: row.createdAt ?? row.createdat ?? null,
  }
}

async function activeShiftForUser(userId) {
  return db.get("SELECT * FROM shifts WHERE userId = ? AND status = 'active' ORDER BY clockIn DESC LIMIT 1", [userId])
}

router.get('/', async (req, res) => {
  const { checkpointId, active = 'true' } = req.query
  const conditions = []
  const params = []
  const role = normalizeRole(req.user?.role)

  if (active !== 'all') {
    conditions.push('po.active = ?')
    params.push(active === 'true' ? 1 : 0)
  }
  if (checkpointId) {
    conditions.push('po.checkpointId = ?')
    params.push(checkpointId)
  }
  if (role !== 'admin') {
    if (role === 'main_account') {
      conditions.push(`po.checkpointId IN (SELECT id FROM checkpoints WHERE clientId = ?)`)
      params.push(req.user.clientId)
    } else {
      conditions.push('(po.assignedUserId IS NULL OR po.assignedUserId = ?)')
      params.push(req.user.id)
      conditions.push('(po.assignedRole IS NULL OR po.assignedRole = ?)')
      params.push(role)
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await db.all(`
    SELECT po.*, c.name as checkpointName, u.name as assignedUserName, creator.name as createdByName
    FROM postOrders po
    LEFT JOIN checkpoints c ON po.checkpointId = c.id
    LEFT JOIN users u ON po.assignedUserId = u.id
    LEFT JOIN users creator ON po.createdBy = creator.id
    ${where}
    ORDER BY po.active DESC, po.createdAt DESC
  `, params)

  const orders = await Promise.all(rows.map(async (row) => {
    const order = normalizeOrder(row)
    if (role === 'admin' || role === 'main_account') return order
    const completion = await db.get(`
      SELECT poc.*, u.name as userName, c.name as checkpointName
      FROM postOrderCompletions poc
      JOIN users u ON poc.userId = u.id
      LEFT JOIN checkpoints c ON poc.checkpointId = c.id
      WHERE poc.postOrderId = ? AND poc.userId = ?
      ORDER BY poc.createdAt DESC
      LIMIT 1
    `, [order.id, req.user.id])
    return { ...order, latestCompletion: normalizeCompletion(completion) }
  }))

  res.json(orders)
})

router.get('/completions', async (req, res) => {
  const role = normalizeRole(req.user?.role)
  let query = `
    SELECT poc.*, u.name as userName, c.name as checkpointName, po.title as postOrderTitle
    FROM postOrderCompletions poc
    JOIN users u ON poc.userId = u.id
    JOIN postOrders po ON poc.postOrderId = po.id
    LEFT JOIN checkpoints c ON poc.checkpointId = c.id
  `
  const conditions = []
  const params = []

  if (role === 'main_account') {
    conditions.push(`po.checkpointId IN (SELECT id FROM checkpoints WHERE clientId = ?)`)
    params.push(req.user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    conditions.push('poc.userId = ?')
    params.push(req.user.id)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY poc.createdAt DESC'

  const rows = await db.all(query, params)
  res.json(rows.map((row) => ({
    ...normalizeCompletion(row),
    postOrderTitle: row.postOrderTitle ?? row.postordertitle ?? '',
  })))
})

router.post('/', adminOrMainAccountOnly, async (req, res) => {
  const {
    title,
    summary,
    instructions,
    checkpointId,
    assignedUserId,
    assignedRole = 'guard',
    priority = 'normal',
    active = true,
    requiresAcknowledgement = false,
    requiresPhotoProof = true,
  } = req.body

  if (!title || !instructions) {
    return res.status(400).json({ message: 'title and instructions are required' })
  }

  const order = {
    id: uuidv4(),
    title,
    summary: summary || '',
    instructions,
    checkpointId: checkpointId || null,
    assignedUserId: assignedUserId || null,
    assignedRole,
    priority,
    active: active ? 1 : 0,
    requiresAcknowledgement: requiresAcknowledgement ? 1 : 0,
    requiresPhotoProof: requiresPhotoProof ? 1 : 0,
    createdBy: req.user.id,
  }

  await db.run(`
    INSERT INTO postOrders (
      id, title, summary, instructions, checkpointId, assignedUserId,
      assignedRole, priority, active, requiresAcknowledgement,
      requiresPhotoProof, createdBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(order))

  const created = await db.get(`
    SELECT po.*, c.name as checkpointName, u.name as assignedUserName, creator.name as createdByName
    FROM postOrders po
    LEFT JOIN checkpoints c ON po.checkpointId = c.id
    LEFT JOIN users u ON po.assignedUserId = u.id
    LEFT JOIN users creator ON po.createdBy = creator.id
    WHERE po.id = ?
  `, [order.id])
  res.status(201).json(normalizeOrder(created))
})

router.put('/:id', adminOrMainAccountOnly, async (req, res) => {
  const existing = await db.get('SELECT * FROM postOrders WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'Post order not found' })

  const merged = {
    ...normalizeOrder(existing),
    ...req.body,
  }

  await db.run(`
    UPDATE postOrders
    SET title = ?, summary = ?, instructions = ?, checkpointId = ?, assignedUserId = ?,
        assignedRole = ?, priority = ?, active = ?, requiresAcknowledgement = ?, requiresPhotoProof = ?
    WHERE id = ?
  `, [
    merged.title,
    merged.summary || '',
    merged.instructions,
    merged.checkpointId || null,
    merged.assignedUserId || null,
    merged.assignedRole || 'guard',
    merged.priority || 'normal',
    merged.active ? 1 : 0,
    merged.requiresAcknowledgement ? 1 : 0,
    merged.requiresPhotoProof ? 1 : 0,
    req.params.id,
  ])

  const updated = await db.get(`
    SELECT po.*, c.name as checkpointName, u.name as assignedUserName, creator.name as createdByName
    FROM postOrders po
    LEFT JOIN checkpoints c ON po.checkpointId = c.id
    LEFT JOIN users u ON po.assignedUserId = u.id
    LEFT JOIN users creator ON po.createdBy = creator.id
    WHERE po.id = ?
  `, [req.params.id])
  res.json(normalizeOrder(updated))
})

router.post('/:id/acknowledge', async (req, res) => {
  const order = await db.get('SELECT * FROM postOrders WHERE id = ? AND active = 1', [req.params.id])
  if (!order) return res.status(404).json({ message: 'Post order not found' })

  const completion = {
    id: uuidv4(),
    postOrderId: req.params.id,
    userId: req.user.id,
    shiftId: (await activeShiftForUser(req.user.id))?.id ?? null,
    checkpointId: order.checkpointId ?? null,
    status: 'acknowledged',
    acknowledgedAt: new Date().toISOString(),
    completedAt: null,
    proofPhotoUrl: '',
    proofNote: '',
    proofGpsLatitude: null,
    proofGpsLongitude: null,
    reviewStatus: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: '',
  }

  await db.run(`
    INSERT INTO postOrderCompletions (
      id, postOrderId, userId, shiftId, checkpointId, status,
      acknowledgedAt, completedAt, proofPhotoUrl, proofNote,
      proofGpsLatitude, proofGpsLongitude, reviewStatus, reviewedBy, reviewedAt, reviewNote
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(completion))

  const created = await db.get(`
    SELECT poc.*, u.name as userName, c.name as checkpointName
    FROM postOrderCompletions poc
    JOIN users u ON poc.userId = u.id
    LEFT JOIN checkpoints c ON poc.checkpointId = c.id
    WHERE poc.id = ?
  `, [completion.id])
  res.status(201).json(normalizeCompletion(created))
})

router.post('/:id/complete', upload.single('photo'), async (req, res) => {
  const orderRow = await db.get(`
    SELECT po.*, c.latitude as checkpointLatitude, c.longitude as checkpointLongitude, c.radiusMeters
    FROM postOrders po
    LEFT JOIN checkpoints c ON po.checkpointId = c.id
    WHERE po.id = ? AND po.active = 1
  `, [req.params.id])
  if (!orderRow) return res.status(404).json({ message: 'Post order not found' })

  const order = normalizeOrder(orderRow)
  if (order.requiresPhotoProof && !req.file) {
    return res.status(400).json({ message: 'A proof photo is required to complete this post order' })
  }

  const gpsLatitude = req.body.gpsLatitude ? Number(req.body.gpsLatitude) : null
  const gpsLongitude = req.body.gpsLongitude ? Number(req.body.gpsLongitude) : null
  const completion = {
    id: uuidv4(),
    postOrderId: req.params.id,
    userId: req.user.id,
    shiftId: (await activeShiftForUser(req.user.id))?.id ?? null,
    checkpointId: order.checkpointId ?? null,
    status: 'completed',
    acknowledgedAt: null,
    completedAt: new Date().toISOString(),
    proofPhotoUrl: req.file ? `/uploads/post-order-proofs/${req.file.filename}` : '',
    proofNote: req.body.proofNote || '',
    proofGpsLatitude: gpsLatitude,
    proofGpsLongitude: gpsLongitude,
    reviewStatus: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: '',
  }

  await db.run(`
    INSERT INTO postOrderCompletions (
      id, postOrderId, userId, shiftId, checkpointId, status,
      acknowledgedAt, completedAt, proofPhotoUrl, proofNote,
      proofGpsLatitude, proofGpsLongitude, reviewStatus, reviewedBy, reviewedAt, reviewNote
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(completion))

  const created = await db.get(`
    SELECT poc.*, u.name as userName, c.name as checkpointName
    FROM postOrderCompletions poc
    JOIN users u ON poc.userId = u.id
    LEFT JOIN checkpoints c ON poc.checkpointId = c.id
    WHERE poc.id = ?
  `, [completion.id])

  if (req.app.get('io')) {
    req.app.get('io').emit('post-order:completion', {
      ...normalizeCompletion(created),
      postOrderTitle: order.title,
    })
  }

  res.status(201).json(normalizeCompletion(created))
})

router.patch('/completions/:id/review', async (req, res) => {
  const { reviewStatus, reviewNote = '' } = req.body
  if (!['verified', 'rejected'].includes(reviewStatus)) {
    return res.status(400).json({ message: 'reviewStatus must be verified or rejected' })
  }

  const role = normalizeRole(req.user?.role)
  if (role !== 'admin' && role !== 'main_account' && role !== 'supervisor') {
    return res.status(403).json({ message: 'Access denied' })
  }

  const existing = await db.get('SELECT * FROM postOrderCompletions WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'Completion not found' })

  await db.run(`
    UPDATE postOrderCompletions
    SET reviewStatus = ?, reviewedBy = ?, reviewedAt = ?, reviewNote = ?
    WHERE id = ?
  `, [reviewStatus, req.user.id, new Date().toISOString(), reviewNote, req.params.id])

  const updated = await db.get(`
    SELECT poc.*, u.name as userName, c.name as checkpointName
    FROM postOrderCompletions poc
    JOIN users u ON poc.userId = u.id
    LEFT JOIN checkpoints c ON poc.checkpointId = c.id
    WHERE poc.id = ?
  `, [req.params.id])
  res.json(normalizeCompletion(updated))
})

export default router
