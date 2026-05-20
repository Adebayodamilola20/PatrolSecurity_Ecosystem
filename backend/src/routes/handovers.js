import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { normalizeRole } from '../utils/roles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(__dirname, '..', 'uploads', 'handover-proofs')
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

function normalizeHandover(row) {
  if (!row) return row
  return {
    id: row.id,
    shiftId: row.shiftId ?? row.shiftid ?? null,
    checkpointId: row.checkpointId ?? row.checkpointid ?? null,
    checkpointName: row.checkpointName ?? row.checkpointname ?? null,
    siteLabel: row.siteLabel ?? row.sitelabel ?? '',
    fromUserId: row.fromUserId ?? row.fromuserid ?? '',
    fromUserName: row.fromUserName ?? row.fromusername ?? '',
    toUserId: row.toUserId ?? row.touserid ?? null,
    toUserName: row.toUserName ?? row.tousername ?? null,
    summary: row.summary ?? '',
    openIssues: row.openIssues ?? row.openissues ?? '',
    equipmentStatus: row.equipmentStatus ?? row.equipmentstatus ?? '',
    photoUrl: row.photoUrl ?? row.photourl ?? '',
    status: row.status ?? 'pending',
    acceptedNote: row.acceptedNote ?? row.acceptednote ?? '',
    createdAt: row.createdAt ?? row.createdat ?? null,
    acceptedAt: row.acceptedAt ?? row.acceptedat ?? null,
  }
}

router.get('/', async (req, res) => {
  const role = normalizeRole(req.user?.role)
  let query = `
    SELECT h.*, cp.name as checkpointName, fu.name as fromUserName, tu.name as toUserName
    FROM handovers h
    LEFT JOIN checkpoints cp ON h.checkpointId = cp.id
    JOIN users fu ON h.fromUserId = fu.id
    LEFT JOIN users tu ON h.toUserId = tu.id
  `
  const conditions = []
  const params = []

  if (role === 'main_account') {
    conditions.push(`(
      h.checkpointId IN (SELECT id FROM checkpoints WHERE clientId = ?)
      OR h.fromUserId IN (SELECT id FROM users WHERE clientId = ?)
    )`)
    params.push(req.user.clientId, req.user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    conditions.push('(h.fromUserId = ? OR h.toUserId = ?)')
    params.push(req.user.id, req.user.id)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY h.createdAt DESC'

  const rows = await db.all(query, params)
  res.json(rows.map(normalizeHandover))
})

router.get('/pending', async (req, res) => {
  const rows = await db.all(`
    SELECT h.*, cp.name as checkpointName, fu.name as fromUserName, tu.name as toUserName
    FROM handovers h
    LEFT JOIN checkpoints cp ON h.checkpointId = cp.id
    JOIN users fu ON h.fromUserId = fu.id
    LEFT JOIN users tu ON h.toUserId = tu.id
    WHERE h.status = 'pending' AND (h.toUserId IS NULL OR h.toUserId = ?)
    ORDER BY h.createdAt DESC
  `, [req.user.id])
  res.json(rows.map(normalizeHandover))
})

router.post('/', upload.single('photo'), async (req, res) => {
  const activeShift = await db.get(
    "SELECT * FROM shifts WHERE userId = ? AND status = 'active' ORDER BY clockIn DESC LIMIT 1",
    [req.user.id],
  )
  const handover = {
    id: uuidv4(),
    shiftId: activeShift?.id ?? null,
    checkpointId: req.body.checkpointId || null,
    siteLabel: req.body.siteLabel || activeShift?.siteLabel || '',
    fromUserId: req.user.id,
    toUserId: req.body.toUserId || null,
    summary: req.body.summary || '',
    openIssues: req.body.openIssues || '',
    equipmentStatus: req.body.equipmentStatus || '',
    photoUrl: req.file ? `/uploads/handover-proofs/${req.file.filename}` : '',
    status: 'pending',
    acceptedNote: '',
    acceptedAt: null,
  }

  if (!handover.summary) {
    return res.status(400).json({ message: 'summary is required' })
  }

  await db.run(`
    INSERT INTO handovers (
      id, shiftId, checkpointId, siteLabel, fromUserId, toUserId, summary,
      openIssues, equipmentStatus, photoUrl, status, acceptedNote, acceptedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(handover))

  const created = await db.get(`
    SELECT h.*, cp.name as checkpointName, fu.name as fromUserName, tu.name as toUserName
    FROM handovers h
    LEFT JOIN checkpoints cp ON h.checkpointId = cp.id
    JOIN users fu ON h.fromUserId = fu.id
    LEFT JOIN users tu ON h.toUserId = tu.id
    WHERE h.id = ?
  `, [handover.id])

  if (req.app.get('io')) req.app.get('io').emit('handover:new', normalizeHandover(created))
  res.status(201).json(normalizeHandover(created))
})

router.patch('/:id/accept', async (req, res) => {
  const existing = await db.get('SELECT * FROM handovers WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'Handover not found' })

  if (existing.toUserId && existing.toUserId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'This handover is assigned to another officer' })
  }

  await db.run(`
    UPDATE handovers
    SET status = 'accepted', toUserId = ?, acceptedNote = ?, acceptedAt = ?
    WHERE id = ?
  `, [req.user.id, req.body.acceptedNote || '', new Date().toISOString(), req.params.id])

  const updated = await db.get(`
    SELECT h.*, cp.name as checkpointName, fu.name as fromUserName, tu.name as toUserName
    FROM handovers h
    LEFT JOIN checkpoints cp ON h.checkpointId = cp.id
    JOIN users fu ON h.fromUserId = fu.id
    LEFT JOIN users tu ON h.toUserId = tu.id
    WHERE h.id = ?
  `, [req.params.id])
  res.json(normalizeHandover(updated))
})

router.patch('/:id/status', adminOnly, async (req, res) => {
  if (!['pending', 'accepted', 'closed'].includes(req.body.status)) {
    return res.status(400).json({ message: 'Invalid handover status' })
  }
  await db.run('UPDATE handovers SET status = ? WHERE id = ?', [req.body.status, req.params.id])
  const updated = await db.get(`
    SELECT h.*, cp.name as checkpointName, fu.name as fromUserName, tu.name as toUserName
    FROM handovers h
    LEFT JOIN checkpoints cp ON h.checkpointId = cp.id
    JOIN users fu ON h.fromUserId = fu.id
    LEFT JOIN users tu ON h.toUserId = tu.id
    WHERE h.id = ?
  `, [req.params.id])
  res.json(normalizeHandover(updated))
})

export default router
