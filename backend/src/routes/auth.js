import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, generateToken } from '../middleware/auth.js'
import { normalizeRole } from '../utils/roles.js'

const router = Router()

async function buildSafeUser(user) {
  let clientName = null
  if (user.clientId) {
    const client = await db.get('SELECT name FROM clients WHERE id = ?', [user.clientId])
    clientName = client?.name || null
  }

  const siteIds = (await db.all(
    'SELECT siteId FROM user_site_assignments WHERE userId = ?',
    [user.id]
  )).map(r => r.siteId)

  const sites = siteIds.length > 0 ? await db.all(
    `SELECT id, name, location FROM sites WHERE id IN (${siteIds.map(() => '?').join(',')})`,
    siteIds
  ) : []

  const { password: _, ...safeUser } = user

  return {
    ...safeUser,
    role: normalizeRole(safeUser.role),
    active: !!safeUser.active,
    clientName,
    siteIds,
    sites,
  }
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  const user = await db.get('SELECT * FROM users WHERE email = ?', [email])
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const valid = bcrypt.compareSync(password, user.password)
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  if (!user.active) {
    return res.status(403).json({ message: 'Account is deactivated' })
  }

  const safeUser = await buildSafeUser(user)
  const token = generateToken({ ...user, siteIds: safeUser.siteIds })
  res.json({
    token,
    user: safeUser,
  })
})

router.get('/me', authMiddleware, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id])
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }
  if (!user.active) {
    return res.status(403).json({ message: 'Account is deactivated' })
  }

  const safeUser = await buildSafeUser(user)
  res.json({ user: safeUser })
})

export default router
