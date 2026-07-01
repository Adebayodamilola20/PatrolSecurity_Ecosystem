import jwt from 'jsonwebtoken'
import { normalizeRole, isAdmin, isMainAccount } from '../utils/roles.js'

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
 
  return secret
}

export function assertJwtSecretConfigured() {
  getJwtSecret()
}

export function generateToken(user) {
  const siteIds = Array.isArray(user.siteIds) ? user.siteIds : []
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      clientId: user.clientId || null,
      siteIds,
    },
    getJwtSecret(),
    { expiresIn: '24h' }
  )
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' })
  }

  const token = header.split(' ')[1]
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

export function adminOnly(req, res, next) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' })
  }
  next()
}

export function adminOrMainAccountOnly(req, res, next) {
  if (!isAdmin(req.user?.role) && !isMainAccount(req.user?.role)) {
    return res.status(403).json({ message: 'Admin or Main Account access required' })
  }
  next()
}

export function mainAccountOnly(req, res, next) {
  if (!isMainAccount(req.user?.role)) {
    return res.status(403).json({ message: 'Main Account access required' })
  }
  next()
}}
