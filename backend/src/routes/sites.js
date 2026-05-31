import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly, adminOrMainAccountOnly } from '../middleware/auth.js'
import { normalizeRole } from '../utils/roles.js'

const router = Router()
router.use(authMiddleware)

function normalizeSite(row) {
  if (!row) return row
  return {
    id: row.id,
    clientId: row.clientId ?? row.clientid ?? '',
    name: row.name,
    location: row.location ?? '',
    active: !!(row.active ?? row.active === 1),
    createdAt: row.createdAt ?? row.createdat ?? null,
  }
}

router.get('/', async (req, res) => {
  const { clientId } = req.query
  const role = normalizeRole(req.user?.role)
  let query = 'SELECT * FROM sites'
  const conditions = []
  const params = []

  if (clientId) {
    conditions.push('clientId = ?')
    params.push(clientId)
  }

  if (role === 'main_account') {
    conditions.push('clientId = ?')
    params.push(req.user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    conditions.push(`id IN (SELECT siteId FROM user_site_assignments WHERE userId = ?)`)
    params.push(req.user.id)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY name'

  const rows = await db.all(query, params)
  res.json(rows.map(normalizeSite))
})

router.get('/:id', async (req, res) => {
  const role = normalizeRole(req.user?.role)
  let query = 'SELECT * FROM sites WHERE id = ?'
  const params = [req.params.id]

  if (role === 'main_account') {
    query += ' AND clientId = ?'
    params.push(req.user.clientId)
  } else if (role === 'supervisor' || role === 'guard') {
    query += ' AND id IN (SELECT siteId FROM user_site_assignments WHERE userId = ?)'
    params.push(req.user.id)
  }

  const row = await db.get(query, params)
  if (!row) return res.status(404).json({ message: 'Site not found' })
  res.json(normalizeSite(row))
})

router.post('/', adminOrMainAccountOnly, async (req, res) => {
  const { name, location, clientId } = req.body
  if (!name) return res.status(400).json({ message: 'name is required' })

  const site = {
    id: uuidv4(),
    clientId: clientId || req.user.clientId || null,
    name,
    location: location || '',
    active: 1,
  }

  await db.run(`
    INSERT INTO sites (id, clientId, name, location, active)
    VALUES (?, ?, ?, ?, ?)
  `, Object.values(site))

  res.status(201).json(normalizeSite(site))
})

export default router
