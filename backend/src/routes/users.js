import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
  const users = await db.all('SELECT id, name, email, role, phone, active, createdAt FROM users ORDER BY createdAt DESC')
  res.json(users.map(u => ({ ...u, active: !!u.active })))
})

router.post('/', adminOnly, async (req, res) => {
  const { name, email, password, role, phone } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, password are required' })
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email])
  if (existing) {
    return res.status(409).json({ message: 'Email already in use' })
  }

  const validRoles = ['admin', 'supervisor', 'officer']
  const userRole = validRoles.includes(role) ? role : 'officer'

  const hashed = bcrypt.hashSync(password, 10)
  const user = {
    id: uuidv4(),
    name,
    email,
    password: hashed,
    role: userRole,
    phone: phone || '',
    active: 1,
  }

  await db.run(`
    INSERT INTO users (id, name, email, password, role, phone, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, Object.values(user))

  const { password: _, ...safeUser } = user
  res.status(201).json({ ...safeUser, active: !!safeUser.active })
})

export default router
