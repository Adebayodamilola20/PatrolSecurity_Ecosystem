// Shared types for the client portal. These describe the shape the `/client/*`
// endpoints return. Kept deliberately read-only — clients never mutate data.

export type ClientUserRole = 'main_account'

export interface ClientUser {
  id: string
  name: string
  email: string
  role: ClientUserRole | string
  phone?: string
  clientId?: string | null
  clientName?: string | null
  siteIds?: string[]
}

export interface ClientSite {
  id: string
  name: string
  location: string
}

/**
 * Guard staffing NUMBERS for the client portal. Deliberately contains no
 * identities — clients never see guard names, photos or personal details.
 */
export interface ClientGuardStats {
  assigned: number
  clockedIn: number
  pending: number
}

export interface ClientScan {
  id: string
  guardName: string
  checkpointName: string
  siteLabel?: string
  scannedAt: number
  gpsValid: boolean
}

export interface ClientSubLocation {
  id: string
  name: string
  code: string
  active: boolean
  scansToday: number
  verifiedToday: number
  lastScanAt: string | null
  lastScanVerified: boolean | null
}

/** A location (site) with its sub-location QR points, from /client/sites. */
export interface ClientSiteDetail {
  id: string
  name: string
  location: string
  address: string | null
  latitude: number | null
  longitude: number | null
  radiusMeters: number | null
  active: boolean
  scansToday: number
  verifiedToday: number
  subLocations: ClientSubLocation[]
}

export interface ClientCheckpoint {
  id: string
  name: string
  code: string
  siteLabel?: string
  latitude: number
  longitude: number
  /** % of expected scans hit in the selected window, if computed by backend. */
  hitRate?: number | null
  lastScanAt?: number | null
}

export interface ClientReport {
  id: string
  title: string
  type: string
  submittedAt: number
}

export interface ClientOverview {
  guardsOnDuty: number
  totalGuards: number
  sites: ClientSite[]
  scansToday: number
  lastScanAt?: number | null
  /** Coverage % across the client's checkpoints today, if computed. */
  coveragePct?: number | null
}
