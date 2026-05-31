import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { normalizeRole } from '../utils/roles.js'

const router = Router()
router.use(authMiddleware)

function normalizeClient(row) {
  if (!row) return row
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    active: !!(row.active ?? row.active === 1),
    createdAt: row.createdAt ?? row.createdat ?? null,
  }
}

router.get('/', async (req, res) => {
  const role = normalizeRole(req.user?.role)
  let query = 'SELECT * FROM clients'
  const params = []

  if (role === 'main_account') {
    query += ' WHERE id = ?'
    params.push(req.user.clientId)
  }

  query += ' ORDER BY name'
  const rows = await db.all(query, params)
  res.json(rows.map(normalizeClient))
})

router.get('/:id', async (req, res) => {
  const role = normalizeRole(req.user?.role)
  let query = 'SELECT * FROM clients WHERE id = ?'
  const params = [req.params.id]

  if (role === 'main_account') {
    query += ' AND id = ?'
    params.push(req.user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    return res.status(403).json({ message: 'Access denied' })
  }

  const row = await db.get(query, params)
  if (!row) return res.status(404).json({ message: 'Client not found' })
  res.json(normalizeClient(row))
})

router.post('/', adminOnly, async (req, res) => {
  const { name, email, phone } = req.body
  if (!name) return res.status(400).json({ message: 'name is required' })

  const client = {
    id: uuidv4(),
    name,
    email: email || '',
    phone: phone || '',
    active: 1,
  }

  await db.run(`
    INSERT INTO clients (id, name, email, phone, active)
    VALUES (?, ?, ?, ?, ?)
  `, Object.values(client))

  res.status(201).json(normalizeClient(client))
})

export default router
