import { API_BASE } from '../services/api'

/**
 * Resolves a photo value from the API into an <img src>.
 *
 * The API returns photos as fully-qualified, short-lived signed URLs — minted
 * per viewer, only after the server has authorized them for that record. They
 * are used verbatim; prefixing API_BASE onto one would corrupt it.
 *
 * The relative-path branch exists only for values served by an older API build
 * during a rolling deploy. Nothing new produces them.
 */
export function photoSrc(value?: string | null): string | null {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  const origin = API_BASE.replace(/\/api\/v1$/, '')
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`
}
