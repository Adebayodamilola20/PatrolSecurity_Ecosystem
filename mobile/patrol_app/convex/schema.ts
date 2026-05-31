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
    .index("by_role", ["role"]),

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
    latitude: v.number(),
    longitude: v.number(),
    radiusMeters: v.number(),
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
    clockOutLatitude: v.optional(v.number()),
    clockOutLongitude: v.optional(v.number()),
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
    .index("by_userId_status", ["userId", "status"]),

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
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_officerId", ["officerId"])
    .index("by_checkpointId", ["checkpointId"])
    .index("by_scannedAt", ["scannedAt"])
    .index("by_officerId_scannedAt", ["officerId", "scannedAt"]),

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
    .index("by_capturedAt", ["capturedAt"]),

  incidents: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    officerId: v.id("users"),
    checkpointId: v.optional(v.id("checkpoints")),
    title: v.string(),
    description: v.string(),
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
    .index("by_status", ["status"]),

  reportSubmissions: defineTable({
    legacyId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    siteId: v.optional(v.id("sites")),
    type: v.string(),
    title: v.string(),
    summary: v.string(),
    details: v.any(),
    checkpointId: v.optional(v.id("checkpoints")),
    siteLabel: v.string(),
    userId: v.id("users"),
    status: v.string(),
    submittedAt: v.number(),
    emailedAt: v.optional(v.number()),
    deliveryPayload: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_clientId", ["clientId"])
    .index("by_siteId", ["siteId"])
    .index("by_userId", ["userId"])
    .index("by_type", ["type"])
    .index("by_status", ["status"])
    .index("by_submittedAt", ["submittedAt"]),

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
    .index("by_status", ["status"]),

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
});
