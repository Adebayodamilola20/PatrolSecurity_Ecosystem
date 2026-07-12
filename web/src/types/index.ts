export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'main_account' | 'supervisor' | 'guard'
  phone?: string
  active: boolean
  onDuty?: boolean
  lastClockIn?: string | null
  lastClockOut?: string | null
  clientId?: string | null
  siteIds?: string[]
  sites?: Site[]
  createdAt: string
}

export interface Client {
  id: string
  name: string
  email: string
  phone: string
  active: boolean
  createdAt: string
}

export interface Site {
  id: string
  clientId: string
  name: string
  location: string
  active: boolean
  createdAt: string
}

export interface Checkpoint {
  id: string
  name: string
  code: string
  // Sub-location QRs have no own GPS — they verify against the parent location's
  // geofence — so these can be null.
  latitude: number | null
  longitude: number | null
  radiusMeters: number | null
  expectedIntervalMinutes: number
  active: boolean
  clientId?: string | null
  siteId?: string | null
  lastScan?: string
  scheduledTimeIn?: string
  scheduledTimeOut?: string
}

export interface Incident {
  id: string
  officerId: string
  officerName: string
  checkpointId?: string
  checkpointName?: string | null
  siteName?: string | null
  latitude?: number | null
  longitude?: number | null
  category?: string
  photoUrls?: string[]
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'investigating' | 'resolved'
  reportedAt: string
  resolvedAt?: string
}

export interface MissedPatrol {
  id?: string
  checkpointId: string
  checkpointName: string
  checkpointCode?: string
  siteId?: string | null
  siteName?: string
  clientId?: string | null
  type?: 'never_scanned' | 'overdue'
  message?: string
  expectedInterval?: string
  expectedIntervalMinutes?: number
  gracePeriodMinutes?: number
  lastScan?: string | null
  lastScanAt?: string | null
  dueAt?: string
  detectedAt?: string
  status?: 'open' | 'resolved'
  notificationStatus?: string
  lastOfficer?: string
  timeOverdue?: string | null
}

export interface Scan {
  id: string
  officerId: string
  officerName: string
  officerPhone?: string
  checkpointId: string
  checkpointName: string
  checkpointCode: string
  checkpointActive?: boolean
  checkpointLocation?: string
  scannedAt: string
  receivedAt: string
  gpsLatitude: number
  gpsLongitude: number
  gpsValid: boolean
  distanceMeters: number
  photoUrl?: string
  notes?: string
  scheduledTimeIn?: string
  scheduledTimeOut?: string
}

export interface Report {
  id: string
  clientEmail?: string
  periodStart?: string
  periodEnd?: string
  format?: 'pdf' | 'html'
  status: string
  sentAt?: string
  createdAt: string
  // Guard-submitted reports (reportSubmissions) surfaced in the same list.
  title?: string
  type?: string
  userName?: string
}

export interface ExportFile {
  id: string
  type: string
  date: string
  format: 'xlsx'
  status: 'ready' | 'pending' | 'failed'
  scopeLabel: string
  clientId?: string | null
  requestedBy: string
  requestedByName?: string
  fileName: string
  filePath: string
  downloadUrl: string
  totals: {
    scans: number
    verifiedScans: number
    flaggedScans: number
    shifts: number
    totalShiftHours: number
  }
  generatedAt: string
  createdAt: string
}

export interface DashboardStats {
  totalScans: number
  scansToday: number
  activeOfficers: number
  totalCheckpoints: number
  verifiedScans: number
  flaggedScans: number
}

export interface PostOrder {
  id: string
  title: string
  summary: string
  instructions: string
  checkpointId?: string | null
  checkpointName?: string | null
  siteId?: string | null
  siteName?: string | null
  assignedUserId?: string | null
  assignedUserName?: string | null
  assignedRole?: string
  priority: string
  active: boolean
  requiresAcknowledgement: boolean
  requiresPhotoProof: boolean
  createdBy: string
  createdByName?: string | null
  createdAt: string
  latestCompletion?: PostOrderCompletion | null
}

export interface PostOrderCompletion {
  id: string
  postOrderId: string
  postOrderTitle?: string
  userId: string
  userName?: string
  checkpointId?: string | null
  checkpointName?: string | null
  status: string
  acknowledgedAt?: string | null
  completedAt?: string | null
  proofPhotoUrl?: string
  proofNote?: string
  proofGpsLatitude?: number | null
  proofGpsLongitude?: number | null
  reviewStatus: string
  reviewedAt?: string | null
  reviewNote?: string
  createdAt: string
}

export interface PassOnLog {
  id: string
  title: string
  instruction: string
  priority: 'normal' | 'urgent' | 'critical'
  siteLabel: string
  checkpointId?: string | null
  checkpointName?: string | null
  requiresAcknowledgement: boolean
  active: boolean
  createdBy: string
  createdByName?: string | null
  createdAt: string
  acknowledged?: boolean
}

export interface Handover {
  id: string
  shiftId?: string | null
  checkpointId?: string | null
  checkpointName?: string | null
  siteLabel?: string
  fromUserId: string
  fromUserName?: string
  toUserId?: string | null
  toUserName?: string | null
  summary: string
  openIssues?: string
  equipmentStatus?: string
  photoUrl?: string
  status: string
  acceptedNote?: string
  createdAt: string
  acceptedAt?: string | null
}
