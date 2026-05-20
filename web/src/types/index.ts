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
  latitude: number
  longitude: number
  radiusMeters: number
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
  checkpointName?: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'investigating' | 'resolved'
  reportedAt: string
  resolvedAt?: string
}

export interface MissedPatrol {
  checkpointId: string
  checkpointName: string
  checkpointCode: string
  type: 'never_scanned' | 'overdue'
  message: string
  expectedInterval: string
  lastScan: string | null
  lastOfficer?: string
  timeOverdue: string | null
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
  clientEmail: string
  periodStart: string
  periodEnd: string
  format: 'pdf' | 'html'
  status: 'pending' | 'sent' | 'failed'
  sentAt?: string
  createdAt: string
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
