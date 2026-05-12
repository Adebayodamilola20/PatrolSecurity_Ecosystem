import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'patrol-monitoring-secret-key-2024'

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
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
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' })
  }
  next()
}
