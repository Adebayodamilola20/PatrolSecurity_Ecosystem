import { mutation } from "./_generated/server";
import { v } from "convex/values";

async function byLegacyId(ctx: any, table: string, legacyId?: string | null) {
  if (!legacyId) return null;
  return await ctx.db
    .query(table)
    .withIndex("by_legacyId", (q: any) => q.eq("legacyId", legacyId))
    .unique();
}

async function resolveId(ctx: any, table: string, legacyId?: string | null) {
  const doc = await byLegacyId(ctx, table, legacyId);
  return doc?._id;
}

async function upsert(
  ctx: any,
  table: string,
  legacyId: string,
  value: Record<string, unknown>,
) {
  const existing = await byLegacyId(ctx, table, legacyId);
  if (existing) {
    await ctx.db.patch(existing._id, { legacyId, ...value });
    return existing._id;
  }
  return await ctx.db.insert(table, { legacyId, ...value });
}

export const upsertClient = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) => {
    const existing =
      (await byLegacyId(ctx, "clients", record.id)) ||
      (await ctx.db.query("clients").collect()).find(
        (item: any) => item.name === record.name,
      );
    const value = {
      legacyId: record.id,
      name: record.name,
      email: record.email ?? "",
      phone: record.phone ?? "",
      active: !!record.active,
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("clients", value);
  },
});

export const upsertSite = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) => {
    const existing = await byLegacyId(ctx, "sites", record.id);
    return await upsert(ctx, "sites", record.id, {
      clientId: await resolveId(ctx, "clients", record.clientId),
      name: record.name,
      location: record.location ?? "",
      active: !!record.active,
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    });
  },
});

export const upsertUser = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) => {
    const existing =
      (await byLegacyId(ctx, "users", record.id)) ||
      (await ctx.db
        .query("users")
        .withIndex("by_email", (q: any) => q.eq("email", record.email))
        .unique());
    const value = {
      legacyId: record.id,
      name: record.name,
      email: record.email,
      passwordHash: record.password,
      role: record.role,
      phone: record.phone ?? "",
      active: !!record.active,
      clientId: record.clientId
        ? await resolveId(ctx, "clients", record.clientId)
        : undefined,
      liveTracking:
        record.liveTracking === undefined ? true : !!record.liveTracking,
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("users", value);
  },
});

export const upsertUserSiteAssignment = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) => {
    const userId = await resolveId(ctx, "users", record.userId);
    const siteId = await resolveId(ctx, "sites", record.siteId);
    const site = await ctx.db.get(siteId);
    return await upsert(ctx, "userSiteAssignments", record.id, {
      clientId: site?.clientId,
      userId,
      siteId,
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    });
  },
});

export const upsertCheckpoint = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) => {
    const existing =
      (await byLegacyId(ctx, "checkpoints", record.id)) ||
      (await ctx.db
        .query("checkpoints")
        .withIndex("by_code", (q: any) => q.eq("code", record.code))
        .unique());
    const value = {
      legacyId: record.id,
      clientId: record.clientId
        ? await resolveId(ctx, "clients", record.clientId)
        : undefined,
      siteId: record.siteId
        ? await resolveId(ctx, "sites", record.siteId)
        : undefined,
      name: record.name,
      code: record.code,
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      radiusMeters: Number(record.radiusMeters ?? 10),
      expectedIntervalMinutes: Number(record.expectedIntervalMinutes ?? 30),
      scheduledTimeIn: record.scheduledTimeIn ?? "",
      scheduledTimeOut: record.scheduledTimeOut ?? "",
      active: !!record.active,
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("checkpoints", value);
  },
});

export const upsertShift = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "shifts", record.id, {
      userId: await resolveId(ctx, "users", record.userId),
      status: record.status === "active" ? "active" : "completed",
      clockIn: Date.parse(record.clockIn),
      clockOut: record.clockOut ? Date.parse(record.clockOut) : undefined,
      clockInPhoto: record.clockInPhoto ?? "",
      clockInLatitude: record.clockInLatitude ?? undefined,
      clockInLongitude: record.clockInLongitude ?? undefined,
      clockOutLatitude: record.clockOutLatitude ?? undefined,
      clockOutLongitude: record.clockOutLongitude ?? undefined,
      scheduledStart: record.scheduledStart
        ? Date.parse(record.scheduledStart)
        : undefined,
      scheduledEnd: record.scheduledEnd
        ? Date.parse(record.scheduledEnd)
        : undefined,
      siteLabel: record.siteLabel ?? "",
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    }),
});

export const upsertScan = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "scans", record.id, {
      officerId: await resolveId(ctx, "users", record.officerId),
      checkpointId: await resolveId(ctx, "checkpoints", record.checkpointId),
      scannedAt: Date.parse(record.scannedAt),
      receivedAt: record.receivedAt
        ? Date.parse(record.receivedAt)
        : Date.parse(record.scannedAt),
      gpsLatitude: record.gpsLatitude ?? undefined,
      gpsLongitude: record.gpsLongitude ?? undefined,
      gpsValid: !!record.gpsValid,
      distanceMeters: record.distanceMeters ?? undefined,
      notes: record.notes ?? "",
    }),
});

export const upsertIncident = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "incidents", record.id, {
      officerId: await resolveId(ctx, "users", record.officerId),
      checkpointId: record.checkpointId
        ? await resolveId(ctx, "checkpoints", record.checkpointId)
        : undefined,
      title: record.title,
      description: record.description ?? "",
      severity: record.severity ?? "low",
      status: record.status ?? "open",
      reportedAt: Date.parse(record.reportedAt),
      resolvedAt: record.resolvedAt ? Date.parse(record.resolvedAt) : undefined,
    }),
});

export const upsertReportSubmission = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) => {
    let details = {};
    let deliveryPayload = {};
    try {
      details = JSON.parse(record.detailsJson ?? "{}");
    } catch {}
    try {
      deliveryPayload = JSON.parse(record.deliveryPayload ?? "{}");
    } catch {}
    return await upsert(ctx, "reportSubmissions", record.id, {
      type: record.type,
      title: record.title,
      summary: record.summary ?? "",
      details,
      checkpointId: record.checkpointId
        ? await resolveId(ctx, "checkpoints", record.checkpointId)
        : undefined,
      siteLabel: record.siteLabel ?? "",
      userId: await resolveId(ctx, "users", record.userId),
      status: record.status ?? "submitted",
      submittedAt: Date.parse(record.submittedAt),
      emailedAt: record.emailedAt ? Date.parse(record.emailedAt) : undefined,
      deliveryPayload,
    });
  },
});

export const upsertExportFile = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) => {
    let totals = {};
    try {
      totals = JSON.parse(record.totalsJson ?? "{}");
    } catch {}
    return await upsert(ctx, "exportFiles", record.id, {
      type: record.type,
      date: record.date,
      format: record.format ?? "xlsx",
      status: record.status ?? "ready",
      scopeLabel: record.scopeLabel ?? "",
      clientId: record.clientId
        ? await resolveId(ctx, "clients", record.clientId)
        : undefined,
      requestedBy: await resolveId(ctx, "users", record.requestedBy),
      fileName: record.fileName ?? "",
      storageId: undefined,
      downloadUrl: record.downloadUrl ?? "",
      totals,
      generatedAt: record.generatedAt
        ? Date.parse(record.generatedAt)
        : Date.now(),
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    });
  },
});

export const upsertCommunicationSetting = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "communicationSettings", record.id, {
      scopeType: record.scopeType ?? "global",
      scopeId: record.scopeId ?? "",
      settingKey: record.settingKey,
      settingValue: record.settingValue ?? "",
      updatedBy: record.updatedBy
        ? await resolveId(ctx, "users", record.updatedBy)
        : undefined,
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    }),
});

export const upsertEmergencyEvent = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) => {
    let emailRecipients = [];
    let phoneRecipients = [];
    let deliveryPayload = {};
    try {
      emailRecipients = JSON.parse(record.emailRecipients ?? "[]");
    } catch {}
    try {
      phoneRecipients = JSON.parse(record.phoneRecipients ?? "[]");
    } catch {}
    try {
      deliveryPayload = JSON.parse(record.deliveryPayload ?? "{}");
    } catch {}
    return await upsert(ctx, "emergencyEvents", record.id, {
      userId: await resolveId(ctx, "users", record.userId),
      checkpointId: record.checkpointId
        ? await resolveId(ctx, "checkpoints", record.checkpointId)
        : undefined,
      siteLabel: record.siteLabel ?? "",
      message: record.message ?? "",
      note: record.note ?? "",
      triggeredAt: record.triggeredAt
        ? Date.parse(record.triggeredAt)
        : Date.now(),
      emailRecipients,
      phoneRecipients,
      status: record.status ?? "triggered",
      deliveryPayload,
    });
  },
});

export const upsertPassOnLog = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "passOnLogs", record.id, {
      title: record.title,
      instruction: record.instruction,
      priority: record.priority ?? "normal",
      siteLabel: record.siteLabel ?? "",
      checkpointId: record.checkpointId
        ? await resolveId(ctx, "checkpoints", record.checkpointId)
        : undefined,
      requiresAcknowledgement: !!record.requiresAcknowledgement,
      createdBy: await resolveId(ctx, "users", record.createdBy),
      active: !!record.active,
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    }),
});

export const upsertPassOnLogAcknowledgement = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "passOnLogAcknowledgements", record.id, {
      passOnLogId: await resolveId(ctx, "passOnLogs", record.passOnLogId),
      userId: await resolveId(ctx, "users", record.userId),
      acknowledgedAt: record.acknowledgedAt
        ? Date.parse(record.acknowledgedAt)
        : Date.now(),
      note: record.note ?? "",
    }),
});

export const upsertPostOrder = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "postOrders", record.id, {
      title: record.title,
      summary: record.summary ?? "",
      instructions: record.instructions ?? "",
      checkpointId: record.checkpointId
        ? await resolveId(ctx, "checkpoints", record.checkpointId)
        : undefined,
      assignedUserId: record.assignedUserId
        ? await resolveId(ctx, "users", record.assignedUserId)
        : undefined,
      assignedRole: record.assignedRole ?? "guard",
      priority: record.priority ?? "normal",
      active: !!record.active,
      requiresAcknowledgement: !!record.requiresAcknowledgement,
      requiresPhotoProof:
        record.requiresPhotoProof === undefined
          ? true
          : !!record.requiresPhotoProof,
      createdBy: await resolveId(ctx, "users", record.createdBy),
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    }),
});

export const upsertPostOrderCompletion = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "postOrderCompletions", record.id, {
      postOrderId: await resolveId(ctx, "postOrders", record.postOrderId),
      userId: await resolveId(ctx, "users", record.userId),
      shiftId: record.shiftId
        ? await resolveId(ctx, "shifts", record.shiftId)
        : undefined,
      checkpointId: record.checkpointId
        ? await resolveId(ctx, "checkpoints", record.checkpointId)
        : undefined,
      status: record.status,
      acknowledgedAt: record.acknowledgedAt
        ? Date.parse(record.acknowledgedAt)
        : undefined,
      completedAt: record.completedAt
        ? Date.parse(record.completedAt)
        : undefined,
      proofPhotoUrl: record.proofPhotoUrl ?? "",
      proofNote: record.proofNote ?? "",
      proofGpsLatitude: record.proofGpsLatitude ?? undefined,
      proofGpsLongitude: record.proofGpsLongitude ?? undefined,
      reviewStatus: record.reviewStatus ?? "pending",
      reviewedBy: record.reviewedBy
        ? await resolveId(ctx, "users", record.reviewedBy)
        : undefined,
      reviewedAt: record.reviewedAt ? Date.parse(record.reviewedAt) : undefined,
      reviewNote: record.reviewNote ?? "",
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
    }),
});

export const upsertHandover = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "handovers", record.id, {
      shiftId: record.shiftId
        ? await resolveId(ctx, "shifts", record.shiftId)
        : undefined,
      checkpointId: record.checkpointId
        ? await resolveId(ctx, "checkpoints", record.checkpointId)
        : undefined,
      siteLabel: record.siteLabel ?? "",
      fromUserId: await resolveId(ctx, "users", record.fromUserId),
      toUserId: record.toUserId
        ? await resolveId(ctx, "users", record.toUserId)
        : undefined,
      summary: record.summary ?? "",
      openIssues: record.openIssues ?? "",
      equipmentStatus: record.equipmentStatus ?? "",
      photoUrl: record.photoUrl ?? "",
      status: record.status ?? "pending",
      acceptedNote: record.acceptedNote ?? "",
      createdAt: record.createdAt ? Date.parse(record.createdAt) : Date.now(),
      acceptedAt: record.acceptedAt ? Date.parse(record.acceptedAt) : undefined,
    }),
});

export const upsertOfficerPosition = mutation({
  args: { record: v.any() },
  handler: async (ctx, { record }) =>
    await upsert(ctx, "officerPositions", record.id, {
      userId: await resolveId(ctx, "users", record.userId),
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      accuracy: record.accuracy ?? undefined,
      speed: record.speed ?? undefined,
      heading: record.heading ?? undefined,
      capturedAt: record.capturedAt
        ? Date.parse(record.capturedAt)
        : Date.now(),
    }),
});
