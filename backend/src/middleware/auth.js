import jwt from 'jsonwebtoken'
import { normalizeRole, isAdmin, isMainAccount } from '../utils/roles.js'

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  return secret
}

export function assertJwtSecretConfigured() {
  getJwtSecret()
}

// Strict/high-security session policy:
//  - ACCESS token lives 15 min. Sent on every request; short so a leaked token
//    is only briefly useful.
//  - REFRESH token lives 1h (the idle window). Every silent refresh rotates it
//    and resets this 1h clock, so a user who keeps using the app stays signed
//    in, but one who closes the app for >1h must log in again.
//  - absExp is an absolute cap: 24h after the ORIGINAL login. It survives
//    rotation unchanged, so no chain of refreshes can extend a session past 24h.
export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m'
export const REFRESH_IDLE_TTL = process.env.REFRESH_IDLE_TTL || '1h'
const ABSOLUTE_SESSION_MS = Number(process.env.ABSOLUTE_SESSION_HOURS || 24) * 60 * 60 * 1000

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
    { expiresIn: ACCESS_TOKEN_TTL }
  )
}

// Issues a rotating refresh token. On first login pass no absExp and the 24h
// absolute cap is stamped now; on rotation pass the existing absExp through so
// the cap stays anchored to the original login.
export function generateRefreshToken(user, absExp) {
  const siteIds = Array.isArray(user.siteIds) ? user.siteIds : []
  const absoluteExpiry = absExp || Date.now() + ABSOLUTE_SESSION_MS
  return jwt.sign(
    {
      id: user.id,
      role: normalizeRole(user.role),
      clientId: user.clientId || null,
      siteIds,
      type: 'refresh',
      absExp: absoluteExpiry,
    },
    getJwtSecret(),
    { expiresIn: REFRESH_IDLE_TTL }
  )
}

// Verifies a refresh token: signature + not-expired (idle window) are checked
// by jwt.verify; here we also enforce the token really is a refresh token and
// that the absolute 24h cap has not passed. Throws on any failure.
export function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, getJwtSecret())
  if (decoded.type !== 'refresh') {
    throw new Error('Not a refresh token')
  }
  if (!decoded.absExp || Date.now() > decoded.absExp) {
    throw new Error('Session has reached its maximum lifetime')
  }
  return decoded
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' })
  }

  const token = header.split(' ')[1]
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    // Refresh tokens are only valid at POST /auth/refresh. Reject them anywhere
    // else so a refresh token can never be used as an access token.
    if (decoded.type === 'refresh') {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }
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
}
