import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const userRole = v.union(
  v.literal("admin"),
  v.literal("main_account"),
  v.literal("supervisor"),
  v.literal("guard"),
);

const shiftStatus = v.union(v.literal("active"), v.literal("completed"));

const incidentSeverity = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const incidentStatus = v.union(
  v.literal("open"),
  v.literal("investigating"),
  v.literal("resolved"),
);

const handoverStatus = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("closed"),
);

const activityType = v.union(
  v.literal("clock_in"),
  v.literal("clock_out"),
  v.literal("patrol_scan"),
  v.literal("incident"),
  v.literal("maintenance"),
  v.literal("dar"),
  v.literal("emergency"),
  v.literal("pass_on_log_ack"),
  v.literal("post_order_ack"),
  v.literal("visitor_check_in"),
  v.literal("visitor_check_out"),
  v.literal("truck_check_in"),
  v.literal("truck_check_out"),
);

export default defineSchema({
  clients: defineTable({
    legacyId: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_legacyId", ["legacyId"]),

  sites: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.id("clients"),
    name: v.string(),
    location: v.string(),
    address: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    // Geofence radius for verifying sub-location (checkpoint) scans that
    // carry no coordinates of their own: guard GPS at scan time must fall
    // within this distance of the site coordinates to count as verified.
    radiusMeters: v.optional(v.number()),
    patrolIntervalMinutes: v.optional(v.number()),
    patrolGracePeriodMinutes: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"]),

  users: defineTable({
    legacyId: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: userRole,
    phone: v.string(),
    active: v.boolean(),
    clientId: v.optional(v.id("clients")),
    liveTracking: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_email", ["email"])
    .index("by_clientId", ["clientId"])
    .index("by_role", ["role"])
    .index("by_role_clientId", ["role", "clientId"]),

  // Server-side sessions: one row per refresh token, stored as a SHA-256
  // hash (a database leak never exposes usable tokens). Tokens are single-use
  // and rotate on every refresh; `familyId` ties a login's whole rotation
  // chain together so a stolen-then-reused token revokes the entire session.
  refreshTokens: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    familyId: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    replacedBy: v.optional(v.id("refreshTokens")),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"])
    .index("by_familyId", ["familyId"])
    .index("by_expiresAt", ["expiresAt"]),

  userSiteAssignments: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    userId: v.id("users"),
    siteId: v.id("sites"),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_userId", ["userId"])
    .index("by_siteId", ["siteId"])
    .index("by_userId_siteId", ["userId", "siteId"]),

  checkpoints: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    name: v.string(),
    code: v.string(),
    // Optional: sub-locations are plain QR points with no coordinates of
    // their own; scans are then verified against the parent site geofence.
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    radiusMeters: v.optional(v.number()),
    // The location's own QR point, auto-created with the site. Shown as the
    // location QR (not among sub-locations) on both dashboards.
    isPrimary: v.optional(v.boolean()),
    expectedIntervalMinutes: v.number(),
    scheduledTimeIn: v.string(),
    scheduledTimeOut: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_code", ["code"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"]),

  shifts: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    userId: v.id("users"),
    status: shiftStatus,
    clockIn: v.number(),
    clockOut: v.optional(v.number()),
    clockInPhoto: v.string(),
    clockInLatitude: v.optional(v.number()),
    clockInLongitude: v.optional(v.number()),
    clockInGpsValid: v.optional(v.boolean()),
    clockInDistanceMeters: v.optional(v.number()),
    clockOutLatitude: v.optional(v.number()),
    clockOutLongitude: v.optional(v.number()),
    clockOutGpsValid: v.optional(v.boolean()),
    clockOutDistanceMeters: v.optional(v.number()),
    scheduledStart: v.optional(v.number()),
    scheduledEnd: v.optional(v.number()),
    siteLabel: v.string(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_userId_clockIn", ["userId", "clockIn"]),

  scans: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    officerId: v.id("users"),
    checkpointId: v.id("checkpoints"),
    scannedAt: v.number(),
    receivedAt: v.number(),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    gpsValid: v.boolean(),
    distanceMeters: v.optional(v.number()),
    notes: v.string(),
    postOrdersRequired: v.optional(v.boolean()),
    postOrdersAcknowledgedAt: v.optional(v.number()),
    workflowStatus: v.optional(
      v.union(v.literal("pending_post_order_ack"), v.literal("completed")),
    ),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_officerId", ["officerId"])
    .index("by_checkpointId", ["checkpointId"])
    .index("by_scannedAt", ["scannedAt"])
    .index("by_officerId_scannedAt", ["officerId", "scannedAt"])
    .index("by_siteId_scannedAt", ["siteId", "scannedAt"])
    .index("by_checkpointId_scannedAt", ["checkpointId", "scannedAt"]),

  missedPatrolAlerts: defineTable({
    checkpointId: v.id("checkpoints"),
    siteId: v.optional(v.id("sites")),
    clientId: v.optional(v.id("clients")),
    checkpointName: v.string(),
    siteName: v.string(),
    lastScanAt: v.optional(v.number()),
    dueAt: v.number(),
    detectedAt: v.number(),
    expectedIntervalMinutes: v.number(),
    gracePeriodMinutes: v.number(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    notificationStatus: v.string(),
    deliveryPayload: v.any(),
  })
    .index("by_checkpointId", ["checkpointId"])
    .index("by_status", ["status"])
    .index("by_detectedAt", ["detectedAt"])
    .index("by_checkpointId_status", ["checkpointId", "status"]),

  officerPositions: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    userId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    speed: v.optional(v.number()),
    heading: v.optional(v.number()),
    capturedAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_userId", ["userId"])
    .index("by_capturedAt", ["capturedAt"])
    .index("by_userId_capturedAt", ["userId", "capturedAt"]),

  incidents: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    officerId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    category: v.optional(
      v.union(
        v.literal("Security Incident"),
        v.literal("Theft"),
        v.literal("Fire"),
        v.literal("Medical"),
        v.literal("Visitor Issue"),
        v.literal("Suspicious Activity"),
        v.literal("Other"),
      ),
    ),
    title: v.string(),
    description: v.string(),
    photoUrls: v.optional(v.array(v.string())),
    severity: incidentSeverity,
    status: incidentStatus,
    reportedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_officerId", ["officerId"])
    .index("by_checkpointId", ["checkpointId"])
    .index("by_status", ["status"])
    .index("by_officerId_status", ["officerId", "status"])
    .index("by_clientId_status", ["clientId", "status"]),

  reportSubmissions: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    type: v.string(),
    title: v.string(),
    summary: v.string(),
    details: v.any(),
    equipmentName: v.optional(v.string()),
    evidenceUrls: v.optional(v.array(v.string())),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    checkpointId: v.optional(v.id("checkpoints")),
    siteLabel: v.string(),
    userId: v.id("users"),
    status: v.string(),
    submittedAt: v.number(),
    emailedAt: v.optional(v.number()),
    deliveryPayload: v.any(),
    // Cached generated PDFs (reports are immutable once submitted). The
    // portal variant omits guard identities per the AGM rule.
    pdfStorageId: v.optional(v.id("_storage")),
    portalPdfStorageId: v.optional(v.id("_storage")),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_userId", ["userId"])
    .index("by_type", ["type"])
    .index("by_status", ["status"])
    .index("by_submittedAt", ["submittedAt"])
    .index("by_userId_submittedAt", ["userId", "submittedAt"])
    .index("by_clientId_submittedAt", ["clientId", "submittedAt"]),

  exportFiles: defineTable({
    legacyId: v.optional(v.string()),
    type: v.string(),
    date: v.string(),
    format: v.string(),
    status: v.string(),
    scopeLabel: v.string(),
    clientId: v.optional(v.id("clients")),
    requestedBy: v.id("users"),
    fileName: v.string(),
    storageId: v.optional(v.string()),
    downloadUrl: v.string(),
    totals: v.any(),
    generatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_requestedBy", ["requestedBy"])
    .index("by_clientId", ["clientId"])
    .index("by_type_date", ["type", "date"]),

  communicationSettings: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    scopeType: v.string(),
    scopeId: v.string(),
    settingKey: v.string(),
    settingValue: v.string(),
    updatedBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_settingKey", ["settingKey"])
    .index("by_scope", ["scopeType", "scopeId"]),

  emergencyEvents: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    userId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    siteLabel: v.string(),
    category: v.optional(v.string()),
    message: v.string(),
    note: v.string(),
    triggeredAt: v.number(),
    emailRecipients: v.array(v.string()),
    phoneRecipients: v.array(v.string()),
    status: v.string(),
    deliveryPayload: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_userId", ["userId"])
    .index("by_triggeredAt", ["triggeredAt"])
    .index("by_status", ["status"])
    .index("by_userId_triggeredAt", ["userId", "triggeredAt"]),

  passOnLogs: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    title: v.string(),
    instruction: v.string(),
    priority: v.string(),
    siteLabel: v.string(),
    checkpointId: v.optional(v.id("checkpoints")),
    requiresAcknowledgement: v.boolean(),
    createdBy: v.id("users"),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_createdBy", ["createdBy"])
    .index("by_checkpointId", ["checkpointId"])
    .index("by_active", ["active"]),

  passOnLogAcknowledgements: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    passOnLogId: v.id("passOnLogs"),
    userId: v.id("users"),
    acknowledgedAt: v.number(),
    note: v.string(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_passOnLogId", ["passOnLogId"])
    .index("by_userId", ["userId"])
    .index("by_passOnLogId_userId", ["passOnLogId", "userId"]),

  postOrders: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    title: v.string(),
    summary: v.string(),
    instructions: v.string(),
    checkpointId: v.optional(v.id("checkpoints")),
    assignedUserId: v.optional(v.id("users")),
    assignedRole: userRole,
    priority: v.string(),
    active: v.boolean(),
    requiresAcknowledgement: v.boolean(),
    requiresPhotoProof: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_checkpointId", ["checkpointId"])
    .index("by_assignedUserId", ["assignedUserId"])
    .index("by_active", ["active"]),

  postOrderCompletions: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    postOrderId: v.id("postOrders"),
    userId: v.id("users"),
    shiftId: v.optional(v.id("shifts")),
    checkpointId: v.optional(v.id("checkpoints")),
    status: v.union(v.literal("acknowledged"), v.literal("completed")),
    acknowledgedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    proofPhotoUrl: v.string(),
    proofNote: v.string(),
    proofGpsLatitude: v.optional(v.number()),
    proofGpsLongitude: v.optional(v.number()),
    reviewStatus: v.string(),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.string(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_postOrderId", ["postOrderId"])
    .index("by_userId", ["userId"])
    .index("by_shiftId", ["shiftId"])
    .index("by_postOrderId_userId", ["postOrderId", "userId"]),

  scanPostOrderAcknowledgements: defineTable({
    scanId: v.id("scans"),
    postOrderId: v.id("postOrders"),
    checkpointId: v.id("checkpoints"),
    userId: v.id("users"),
    shiftId: v.optional(v.id("shifts")),
    acknowledgedAt: v.number(),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
  })
    .index("by_scanId", ["scanId"])
    .index("by_postOrderId", ["postOrderId"])
    .index("by_userId", ["userId"])
    .index("by_checkpointId_and_acknowledgedAt", [
      "checkpointId",
      "acknowledgedAt",
    ]),

  siteActivityEvents: defineTable({
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    checkpointId: v.optional(v.id("checkpoints")),
    officerId: v.id("users"),
    activityType,
    sourceTable: v.string(),
    sourceId: v.string(),
    siteName: v.string(),
    locationLabel: v.string(),
    activityLabel: v.string(),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    gpsValid: v.optional(v.boolean()),
    distanceMeters: v.optional(v.number()),
    count: v.number(),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_siteId_and_occurredAt", ["siteId", "occurredAt"])
    .index("by_clientId_and_occurredAt", ["clientId", "occurredAt"])
    .index("by_officerId_and_occurredAt", ["officerId", "occurredAt"])
    .index("by_activityType_and_occurredAt", ["activityType", "occurredAt"]),

  auditLogs: defineTable({
    action: v.string(),
    actorId: v.string(),
    actorRole: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    details: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    success: v.boolean(),
    timestamp: v.number(),
  })
    .index("by_action", ["action"])
    .index("by_actorId", ["actorId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_clientId_timestamp", ["clientId", "timestamp"])
    .index("by_actorId_action", ["actorId", "action"])
    .index("by_action_timestamp", ["action", "timestamp"]),

  aiAuditLogs: defineTable({
    userId: v.id("users"),
    userRole: v.string(),
    question: v.string(),
    intent: v.string(),
    dataSources: v.array(v.string()),
    sensitive: v.boolean(),
    status: v.string(),
    error: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  aiRateLimits: defineTable({
    userId: v.id("users"),
    windowKey: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_windowKey", ["userId", "windowKey"]),

  aiGeneratedReports: defineTable({
    userId: v.id("users"),
    reportType: v.string(),
    title: v.string(),
    content: v.string(),
    // Loosened from v.string(): existing deployment data stores an object here.
    sourceSummary: v.any(),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  aiClientEmails: defineTable({
    userId: v.id("users"),
    reportId: v.optional(v.id("aiGeneratedReports")),
    clientId: v.optional(v.id("clients")),
    subject: v.string(),
    body: v.string(),
    status: v.string(),
    approvedBy: v.optional(v.id("users")),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_clientId_createdAt", ["clientId", "createdAt"]),

  aiKnowledgeDocuments: defineTable({
    title: v.string(),
    type: v.string(),
    siteId: v.optional(v.id("sites")),
    clientId: v.optional(v.id("clients")),
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_uploadedBy", ["uploadedBy"]),

  aiKnowledgeChunks: defineTable({
    documentId: v.id("aiKnowledgeDocuments"),
    chunkIndex: v.number(),
    content: v.string(),
    embeddingJson: v.string(),
    embeddingModel: v.string(),
    createdAt: v.number(),
  })
    .index("by_documentId", ["documentId"]),

  handovers: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    shiftId: v.optional(v.id("shifts")),
    checkpointId: v.optional(v.id("checkpoints")),
    siteLabel: v.string(),
    fromUserId: v.id("users"),
    toUserId: v.optional(v.id("users")),
    summary: v.string(),
    openIssues: v.string(),
    equipmentStatus: v.string(),
    photoUrl: v.string(),
    status: handoverStatus,
    acceptedNote: v.string(),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_fromUserId", ["fromUserId"])
    .index("by_toUserId", ["toUserId"])
    .index("by_status", ["status"])
    .index("by_toUserId_status", ["toUserId", "status"]),

  visitorLogs: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    officerId: v.id("users"),
    visitorName: v.string(),
    visitorPhone: v.string(),
    hostName: v.string(),
    purpose: v.string(),
    vehiclePlate: v.string(),
    idNumber: v.string(),
    checkInAt: v.number(),
    checkOutAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("completed")),
    notes: v.string(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_officerId", ["officerId"])
    .index("by_status", ["status"]),

  truckLogs: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    officerId: v.id("users"),
    driverName: v.string(),
    plateNumber: v.string(),
    company: v.string(),
    purpose: v.string(),
    cargoDescription: v.string(),
    checkInAt: v.number(),
    checkOutAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("completed")),
    notes: v.string(),
    createdAt: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_officerId", ["officerId"])
    .index("by_status", ["status"]),
});
