export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'supervisor' | 'officer'
  phone?: string
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
  lastScan?: string
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
  checkpointLocation?: string
  scannedAt: string
  receivedAt: string
  gpsLatitude: number
  gpsLongitude: number
  gpsValid: boolean
  distanceMeters: number
  photoUrl?: string
  notes?: string
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

export interface DashboardStats {
  totalScans: number
  scansToday: number
  activeOfficers: number
  totalCheckpoints: number
  verifiedScans: number
  flaggedScans: number
}
