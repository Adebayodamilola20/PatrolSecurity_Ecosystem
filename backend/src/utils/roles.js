export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (value === 'officer') return 'guard'
  if (value === 'client_main_account' || value === 'client-main-account') return 'main_account'
  if (value === 'main_account' || value === 'main-account') return 'main_account'
  return value
}

export function isAdmin(role) {
  return normalizeRole(role) === 'admin'
}

export function isMainAccount(role) {
  return normalizeRole(role) === 'main_account'
}

export function isSupervisor(role) {
  return normalizeRole(role) === 'supervisor'
}

export function isGuard(role) {
  return normalizeRole(role) === 'guard'
}

export function canExport(role) {
  const normalized = normalizeRole(role)
  return normalized === 'admin' || normalized === 'main_account'
}

export function canViewLiveTracking(role) {
  const normalized = normalizeRole(role)
  return normalized === 'admin' || normalized === 'main_account' || normalized === 'supervisor'
}

export function canManageUsers(role) {
  return normalizeRole(role) === 'admin'
}

export function canManageCheckpoints(role) {
  return normalizeRole(role) === 'admin' || normalizeRole(role) === 'main_account'
}

export function canManagePostOrders(role) {
  return normalizeRole(role) === 'admin' || normalizeRole(role) === 'main_account'
}

export function canManageHandovers(role) {
  return normalizeRole(role) === 'admin' || normalizeRole(role) === 'main_account'
}

export function canReviewCompletions(role) {
  return normalizeRole(role) === 'admin' || normalizeRole(role) === 'main_account' || normalizeRole(role) === 'supervisor'
}

export function canManageEmergencySettings(role) {
  return normalizeRole(role) === 'admin'
}

export function canViewAlerts(role) {
  return normalizeRole(role) !== 'guard'
}

/**
 * Build WHERE clause conditions and params for scope-based filtering.
 * @param {object} user - req.user from JWT
 * @param {object} opts
 * @param {string} opts.checkpointPrefix - table alias for checkpoints (e.g. 'c')
 * @param {string} opts.userPrefix - table alias for users (e.g. 'u')
 * @param {string} opts.shiftPrefix - table alias for shifts (e.g. 's')
 * @returns {{ conditions: string[], params: any[] }}
 */
export function buildScopeFilter(user, opts = {}) {
  const role = normalizeRole(user.role)
  const cp = opts.checkpointPrefix ? opts.checkpointPrefix + '.' : ''
  const up = opts.userPrefix ? opts.userPrefix + '.' : ''
  const sp = opts.shiftPrefix ? opts.shiftPrefix + '.' : ''
  const conditions = []
  const params = []

  if (role === 'admin') {
    return { conditions, params }
  }

  if (role === 'main_account') {
    conditions.push(`${cp}clientId = ?`)
    params.push(user.clientId)
    return { conditions, params }
  }

  conditions.push(`(
    ${cp}siteId IN (SELECT usa.siteId FROM user_site_assignments usa WHERE usa.userId = ?)
    OR ${cp}id IN (SELECT DISTINCT s.checkpointId FROM scans s WHERE s.officerId = ?)
  )`)
  params.push(user.id, user.id)

  return { conditions, params }
}

/**
 * Build conditions to scope users list by role.
 */
export function buildUserScopeFilter(user, opts = {}) {
  const role = normalizeRole(user.role)
  const prefix = opts.userPrefix ? opts.userPrefix + '.' : ''
  const conditions = []
  const params = []

  if (role === 'admin') {
    return { conditions, params }
  }

  if (role === 'main_account') {
    conditions.push(`${prefix}clientId = ?`)
    params.push(user.clientId)
    return { conditions, params }
  }

  conditions.push(`${prefix}id = ?`)
  params.push(user.id)
  return { conditions, params }
}
