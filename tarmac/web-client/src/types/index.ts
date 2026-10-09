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
  /** The location's own QR point (auto-created with the location). */
  locationQr: ClientSubLocation | null
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

/**
 * An instruction written for the guards on this account's sites. Unlike every
 * other type here it flows outward — the client writes it, the guards read it
 * on their phones.
 */
export interface ClientPassOn {
  id: string
  title: string
  instruction: string
  priority: string
  siteId: string | null
  siteName: string | null
  checkpointId: string | null
  checkpointName: string | null
  siteLabel: string
  requiresAcknowledgement: boolean
  createdByName: string
  createdByRole: string | null
  active: boolean
  createdAt: string
}

/**
 * A live emergency on one of this account's sites.
 *
 * `source` says which way it is travelling: "guard" is one of the officers on
 * site in trouble, "client" is this account calling the guards in.
 */
export interface ClientEmergency {
  id: string
  category: string
  message: string
  reason: string
  status: string
  source: 'guard' | 'client'
  siteId: string | null
  siteName: string | null
  checkpointName: string | null
  triggeredAt: string
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

/**
 * Patrol analytics from /client/analytics. Every figure is aggregated from
 * real scans, shifts, incidents and reports — nothing is estimated. Guard
 * identities are never included (see `topGuards` on the staff dashboard).
 */
export interface AnalyticsSeriesPoint {
  date: string
  patrols: number
  verified: number
  incidents: number
}

export interface AnalyticsSiteRow {
  id: string
  name: string
  patrols: number
  verified: number
  verificationRate: number | null
  lastScanAt: number | null
}

export interface AnalyticsSummary {
  range: { since: number; until: number; days: number }
  /** True when the window hit the backend row cap and figures are partial. */
  truncated: boolean
  totals: {
    patrols: number
    verifiedPatrols: number
    verificationRate: number | null
    incidents: number
    openIncidents: number
    reports: number
    shifts: number
    dutyHours: number
    avgShiftHours: number | null
    activeGuards: number
    sites: number
  }
  series: AnalyticsSeriesPoint[]
  sites: AnalyticsSiteRow[]
  incidentsBySeverity: { severity: string; count: number }[]
  incidentsByCategory: { category: string; count: number }[]
  /** Staff dashboard only; always empty in the client portal. */
  topGuards: { id: string; name: string; patrols: number }[]
}
