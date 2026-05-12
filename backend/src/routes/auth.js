import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { generateToken } from '../middleware/auth.js'

const router = Router()

router.post('/login', (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
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

  const token = generateToken(user)
  const { password: _, ...safeUser } = user
  res.json({ token, user: { ...safeUser, active: !!safeUser.active } })
})

export default router
