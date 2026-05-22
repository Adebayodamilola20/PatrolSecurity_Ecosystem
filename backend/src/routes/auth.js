import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'
import { authMiddleware, generateToken } from '../middleware/auth.js'
import { normalizeRole } from '../utils/roles.js'
import { sendEmail } from '../services/notifications.js'

const router = Router()
const PASSWORD_RESET_EXPIRY_MINUTES = 30

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

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
    liveTracking: !!(safeUser.liveTracking ?? safeUser.livetracking ?? 1),
    clientName,
    siteIds,
    sites,
  }
}

router.post('/login', async (req, res) => {
  const { email, password, clientType } = req.body

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

  const normalizedRole = normalizeRole(user.role)
  if (clientType === 'mobile' && normalizedRole !== 'guard') {
    return res.status(403).json({ message: 'Mobile access is restricted to guard accounts' })
  }

  const safeUser = await buildSafeUser(user)
  const token = generateToken({ ...user, siteIds: safeUser.siteIds })
  res.json({
    token,
    user: safeUser,
  })
})

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email) {
    return res.status(400).json({ message: 'Email is required' })
  }

  const genericResponse = {
    message: 'If the account exists, a password reset link will be sent shortly.',
  }

  const user = await db.get('SELECT id, name, email, active FROM users WHERE email = ?', [email])
  if (!user || !user.active) {
    return res.status(202).json(genericResponse)
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashResetToken(rawToken)
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000).toISOString()

  await db.run('DELETE FROM passwordResetTokens WHERE userId = ?', [user.id])
  await db.run(`
    INSERT INTO passwordResetTokens (id, userId, tokenHash, expiresAt, usedAt)
    VALUES (?, ?, ?, ?, ?)
  `, [uuidv4(), user.id, tokenHash, expiresAt, null])

  const resetBaseUrl = process.env.PASSWORD_RESET_URL_BASE?.trim()
    || process.env.WEB_APP_URL?.trim()
    || 'http://localhost:5173/reset-password'
  const normalizedBaseUrl = resetBaseUrl.endsWith('/')
    ? resetBaseUrl.slice(0, -1)
    : resetBaseUrl
  const resetUrl = normalizedBaseUrl.includes('/reset-password')
    ? `${normalizedBaseUrl}/${rawToken}`
    : `${normalizedBaseUrl}/reset-password/${rawToken}`

  try {
    await sendEmail({
      to: user.email,
      subject: 'Reset your Patrol Monitoring password',
      html: `
        <p>Hello ${user.name || 'there'},</p>
        <p>Use the link below to reset your password. It expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
      text: `Hello ${user.name || 'there'},\n\nReset your password using this link (expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      tags: [{ name: 'flow', value: 'password-reset' }],
    })
  } catch (error) {
    console.error('[auth] Failed to send password reset email:', error.message)
  }

  res.status(202).json(genericResponse)
})

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim()
  const password = String(req.body?.password || '')

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' })
  }

  const resetRecord = await db.get(`
    SELECT * FROM passwordResetTokens
    WHERE tokenHash = ? AND usedAt IS NULL
    ORDER BY createdAt DESC
    LIMIT 1
  `, [hashResetToken(token)])

  if (!resetRecord) {
    return res.status(400).json({ message: 'Reset link is invalid or has already been used' })
  }

  if (new Date(resetRecord.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ message: 'Reset link has expired' })
  }

  await db.run('UPDATE users SET password = ? WHERE id = ?', [
    bcrypt.hashSync(password, 10),
    resetRecord.userId,
  ])
  await db.run('UPDATE passwordResetTokens SET usedAt = ? WHERE id = ?', [
    new Date().toISOString(),
    resetRecord.id,
  ])
  await db.run('DELETE FROM passwordResetTokens WHERE userId = ? AND id != ?', [
    resetRecord.userId,
    resetRecord.id,
  ])

  res.json({ message: 'Password reset successful' })
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
