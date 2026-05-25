import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { json, methodNotAllowed, parseJson } from "./lib/http";
import { api } from "./_generated/api";
import bcrypt from "bcryptjs";
import { signPatrolToken } from "./lib/jwt";
import { requireAuth } from "./lib/httpAuth";

const http = httpRouter();

function pathParts(request: Request) {
  return new URL(request.url).pathname.split("/").filter(Boolean);
}

function lastPathPart(request: Request, offset = 0) {
  const parts = pathParts(request);
  return parts[parts.length - 1 - offset] ?? null;
}

function base64ToBlob(base64: string, contentType = "image/jpeg") {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: contentType });
}

async function maybeResolveCheckpointId(
  ctx: {
    runQuery: (reference: unknown, args: Record<string, unknown>) => Promise<unknown>;
  },
  rawId: unknown,
) {
  if (typeof rawId !== "string" || !rawId.trim()) {
    return undefined;
  }
  return (await ctx.runQuery(api.checkpoints.resolveId, {
    id: rawId.trim(),
  })) as string | null | undefined;
}

function isExportRole(role: string) {
  return role === "admin" || role === "main_account";
}

function csvList(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () =>
    json({
      status: "ok",
      timestamp: new Date().toISOString(),
      provider: "convex",
    }),
  ),
});

http.route({
  path: "/dev/seed",
  method: "POST",
  handler: httpAction(async (ctx) => {
    const hasUsers = await ctx.runQuery(api.dev.hasUsers, {});
    if (hasUsers) {
      return json({ seeded: false, reason: "users already exist" });
    }
    const passwordHash = await bcrypt.hash("123456", 10);
    const result = await ctx.runMutation(api.dev.seedDefaults, {
      adminPasswordHash: passwordHash,
      clientPasswordHash: passwordHash,
      guardPasswordHash: passwordHash,
    });
    return json({
      ...result,
      credentials: {
        admin: "admin@securecorp.com / 123456",
        client: "client@securecorp.com / 123456",
        guard: "guard@securecorp.com / 123456",
      },
    });
  }),
});

http.route({
  path: "/dev/demo-content",
  method: "POST",
  handler: httpAction(async (ctx) => {
    return json(await ctx.runMutation(api.dev.ensureDemoContent, {}));
  }),
});

http.route({
  path: "/auth/login",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await parseJson(request);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const clientType = String(body?.clientType ?? "");
    if (!email || !password) {
      return json({ message: "Email and password are required" }, { status: 400 });
    }

    const user = await ctx.runQuery(api.users.findByEmail, { email });
    if (!user || !user.active) {
      return json({ message: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return json({ message: "Invalid credentials" }, { status: 401 });
    }
    if (clientType === "mobile" && user.role !== "guard") {
      return json(
        { message: "Mobile access is restricted to guard accounts" },
        { status: 403 },
      );
    }

    const safeUser = await ctx.runQuery(api.users.getSafeProfile, { userId: user._id });
    const token = await signPatrolToken({
      userId: user._id,
      email: user.email,
      role: user.role,
    });
    return json({ token, user: safeUser });
  }),
});

http.route({
  path: "/auth/change-password",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      return json(
        { message: "Current password and new password are required" },
        { status: 400 },
      );
    }
    if (newPassword.length < 6) {
      return json({ message: "New password must be at least 6 characters" }, { status: 400 });
    }
    const stored = await ctx.runQuery(api.users.findByEmail, { email: user.email });
    if (!stored) return json({ message: "User not found" }, { status: 404 });
    const valid = await bcrypt.compare(currentPassword, stored.passwordHash);
    if (!valid) {
      return json({ message: "Current password is incorrect" }, { status: 401 });
    }
    await ctx.runMutation(api.users.changePassword, {
      userId: stored._id,
      passwordHash: await bcrypt.hash(newPassword, 10),
    });
    return json({ message: "Password updated successfully" });
  }),
});

http.route({
  path: "/emergency/settings",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    return json(await ctx.runQuery(api.settings.list, {}));
  }),
});

http.route({
  path: "/emergency/settings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return json({ message: "Admin access required" }, { status: 403 });
    }
    const body = await parseJson(request);
    const settingKey = String(body?.settingKey ?? "").trim();
    if (!settingKey) return json({ message: "settingKey is required" }, { status: 400 });
    return json(
      await ctx.runMutation(api.settings.create, {
        settingKey,
        settingValue:
          typeof body?.settingValue === "string"
            ? body.settingValue
            : JSON.stringify(body?.settingValue ?? ""),
        scopeType: typeof body?.scopeType === "string" ? body.scopeType : undefined,
        scopeId: typeof body?.scopeId === "string" ? body.scopeId : undefined,
        updatedBy: user.convexId,
      }),
      { status: 201 },
    );
  }),
});

http.route({
  path: "/checkpoints",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "GET") return methodNotAllowed(request.method);
    return json(await ctx.runQuery(api.checkpoints.listForApi, {}));
  }),
});

http.route({
  path: "/scans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    return json(
      await ctx.runQuery(api.scans.listForApi, {
        officerId: user.role === "guard" ? user.convexId : undefined,
        limit: 1000,
      }),
    );
  }),
});

http.route({
  path: "/scans",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    if (!checkpointId) {
      return json({ message: "Checkpoint not found" }, { status: 404 });
    }
    const scan = await ctx.runMutation(api.scans.create, {
      officerId: user.convexId,
      checkpointId,
      gpsLatitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
      gpsLongitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
      notes: typeof body?.notes === "string" ? body.notes : undefined,
    });
    return json(scan, { status: 201 });
  }),
});

http.route({
  path: "/scans/export/daily",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    if (!isExportRole(user.role)) {
      return json({ message: "Only Admin and Main Account can review exports" }, { status: 403 });
    }
    return json(await ctx.runQuery(api.exports.listDailyExportsForUser, { userId: user.convexId }));
  }),
});

http.route({
  path: "/scans/export/daily",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    if (!isExportRole(user.role)) {
      return json({ message: "Only Admin and Main Account can request exports" }, { status: 403 });
    }
    const body = await parseJson(request);
    const date = String(body?.date ?? "").trim();
    if (!date) return json({ message: "date is required" }, { status: 400 });

    const scans = (await ctx.runQuery(api.scans.listForApi, {
      officerId: undefined,
      limit: 5000,
    })) as Array<Record<string, unknown>>;
    const shifts = (await ctx.runQuery(api.shifts.listForExport, {})) as Array<Record<string, unknown>>;
    const dayScans = scans.filter((scan) => String(scan.scannedAt ?? "").startsWith(date));
    const dayShifts = shifts.filter((shift) => String(shift.clockIn ?? "").startsWith(date));
    const totals = {
      scans: dayScans.length,
      verifiedScans: dayScans.filter((scan) => scan.gpsValid === true).length,
      flaggedScans: dayScans.filter((scan) => scan.gpsValid !== true).length,
      shifts: dayShifts.length,
      totalShiftHours: dayShifts.reduce((sum, shift) => {
        const clockIn = Date.parse(String(shift.clockIn ?? ""));
        const clockOut = Date.parse(String(shift.clockOut ?? ""));
        if (Number.isNaN(clockIn) || Number.isNaN(clockOut)) return sum;
        return sum + (clockOut - clockIn) / 3600000;
      }, 0),
    };
    const csvRows = [
      "type,id,officer,checkpoint,time,gpsValid,distanceMeters",
      ...dayScans.map((scan) =>
        [
          "scan",
          scan.id,
          scan.officerName,
          scan.checkpointName,
          scan.scannedAt,
          scan.gpsValid,
          scan.distanceMeters,
        ].join(","),
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const storageId = await ctx.storage.store(blob);
    const downloadUrl = (await ctx.storage.getUrl(storageId)) ?? "";
    const fileName = `daily-tour-${date}.csv`;
    const record = await ctx.runMutation(api.exports.createDailyExportRecord, {
      userId: user.convexId,
      date,
      scopeLabel: user.clientName ?? "All clients",
      fileName,
      downloadUrl,
      storageId,
      totals,
    });
    return json(record, { status: 201 });
  }),
});

http.route({
  path: "/shifts/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    return json(await ctx.runQuery(api.shifts.getStatusForUser, { userId: user.convexId }));
  }),
});

http.route({
  path: "/shifts/clock-in",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    return json(
      await ctx.runMutation(api.shifts.clockIn, {
        userId: user.convexId,
        latitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
        longitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
        siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : undefined,
      }),
      { status: 201 },
    );
  }),
});

http.route({
  path: "/shifts/clock-out",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const activeShift = await ctx.runQuery(api.shifts.getActiveForUser, { userId: user.convexId });
    if (!activeShift) return json({ message: "No active shift found" }, { status: 404 });
    const body = await parseJson(request);
    return json(
      await ctx.runMutation(api.shifts.clockOut, {
        shiftId: activeShift._id,
        latitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
        longitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
      }),
    );
  }),
});

http.route({
  path: "/positions",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    if (typeof body?.latitude !== "number" || typeof body?.longitude !== "number") {
      return json({ message: "latitude and longitude are required" }, { status: 400 });
    }
    return json(
      await ctx.runMutation(api.positions.record, {
        userId: user.convexId,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy: typeof body?.accuracy === "number" ? body.accuracy : undefined,
        speed: typeof body?.speed === "number" ? body.speed : undefined,
        heading: typeof body?.heading === "number" ? body.heading : undefined,
        capturedAt: body?.capturedAt ? Date.parse(String(body.capturedAt)) : undefined,
      }),
      { status: 201 },
    );
  }),
});

http.route({
  path: "/incidents",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    const title = String(body?.title ?? "").trim();
    if (!title) return json({ message: "title is required" }, { status: 400 });
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    return json(
      {
        id: await ctx.runMutation(api.incidents.create, {
          officerId: user.convexId,
          checkpointId,
          title,
          description: typeof body?.description === "string" ? body.description : undefined,
          severity:
            body?.severity === "low" ||
            body?.severity === "medium" ||
            body?.severity === "high" ||
            body?.severity === "critical"
              ? body.severity
              : undefined,
        }),
      },
      { status: 201 },
    );
  }),
});

http.route({
  path: "/reports/daily-activity",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    const summary = String(body?.summary ?? "").trim();
    if (!summary) return json({ message: "summary is required" }, { status: 400 });
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    return json(
      {
        id: await ctx.runMutation(api.reports.submit, {
          type: "daily-activity",
          title: `Daily Activity Report - ${user.name}`,
          summary,
          details: {
            activities: body?.activities ?? "",
            openIssues: body?.openIssues ?? "",
            shiftWindow: body?.shiftWindow ?? "",
          },
          checkpointId,
          siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : "",
          userId: user.convexId,
        }),
      },
      { status: 201 },
    );
  }),
});

http.route({
  path: "/reports/maintenance",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    const title = String(body?.title ?? "").trim();
    const issue = String(body?.issue ?? "").trim();
    if (!title || !issue) {
      return json({ message: "title and issue are required" }, { status: 400 });
    }
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    return json(
      {
        id: await ctx.runMutation(api.reports.submit, {
          type: "maintenance",
          title,
          summary: issue,
          details: {
            assetName: body?.assetName ?? "",
            severity: body?.severity ?? "medium",
          },
          checkpointId,
          siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : "",
          userId: user.convexId,
        }),
      },
      { status: 201 },
    );
  }),
});

http.route({
  path: "/emergency/trigger",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    const emergencyEmails = csvList(
      (await ctx.runQuery(api.settings.getLatest, {
        settingKey: "emergency_email_recipients",
      })) as string | null,
    );
    const emergencyPhones = csvList(
      (await ctx.runQuery(api.settings.getLatest, {
        settingKey: "emergency_phone_recipients",
      })) as string | null,
    );
    const siteLabel = typeof body?.siteLabel === "string" ? body.siteLabel : "";
    const note = typeof body?.note === "string" ? body.note : "";
    const location =
      typeof body?.location === "string" && body.location.trim()
        ? body.location
        : siteLabel || "Unknown location";
    const event = await ctx.runMutation(api.emergency.trigger, {
      userId: user.convexId,
      checkpointId,
      siteLabel,
      note,
      location,
    });
    const delivery =
      emergencyEmails.length || emergencyPhones.length
        ? await ctx.runAction(api.notifications.sendEmergencyAlert, {
            eventId: event.id,
            officerName: user.name,
            officerEmail: user.email,
            siteLabel,
            location,
            note,
            triggeredAt: event.triggeredAt,
            emailRecipients: emergencyEmails,
            phoneRecipients: emergencyPhones,
          })
        : {
            status: "no_recipients_configured",
            deliveries: [],
            summary: {
              attempted: 0,
              delivered: 0,
              failed: 0,
            },
          };
    await ctx.runMutation(api.emergency.recordDelivery, {
      eventId: event.id,
      emailRecipients: emergencyEmails,
      phoneRecipients: emergencyPhones,
      status: delivery.status,
      deliveryPayload: delivery,
    });
    return json(
      {
        ...event,
        emailRecipients: emergencyEmails,
        phoneRecipients: emergencyPhones,
        status: delivery.status,
        delivery,
      },
      { status: 201 },
    );
  }),
});

http.route({
  path: "/pass-on-logs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    return json(await ctx.runQuery(api.passOnLogs.listForUser, { userId: user.convexId }));
  }),
});

http.route({
  path: "/pass-on-logs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    const title = String(body?.title ?? "").trim();
    const instruction = String(body?.instruction ?? "").trim();
    if (!title || !instruction) {
      return json({ message: "title and instruction are required" }, { status: 400 });
    }
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    return json(
      await ctx.runMutation(api.passOnLogs.create, {
        title,
        instruction,
        priority: typeof body?.priority === "string" ? body.priority : undefined,
        siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : undefined,
        checkpointId,
        requiresAcknowledgement:
          typeof body?.requiresAcknowledgement === "boolean"
            ? body.requiresAcknowledgement
            : undefined,
        createdBy: user.convexId,
      }),
      { status: 201 },
    );
  }),
});

http.route({
  path: "/pass-on-logs/pending-acknowledgements",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const logs = await ctx.runQuery(api.passOnLogs.listPendingForUser, { userId: user.convexId });
    return json({ hasPending: logs.length > 0, count: logs.length });
  }),
});

http.route({
  path: "/pass-on-logs/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    return json(await ctx.runQuery(api.passOnLogs.listPendingForUser, { userId: user.convexId }));
  }),
});

http.route({
  pathPrefix: "/pass-on-logs/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id || action !== "acknowledge") {
      return json({ message: "Pass-on-log route not found" }, { status: 404 });
    }
    const passOnLogId = await ctx.runQuery(api.passOnLogs.resolveId, { id });
    if (!passOnLogId) return json({ message: "Pass-on-log not found" }, { status: 404 });
    const body = await parseJson(request);
    return json(
      await ctx.runMutation(api.passOnLogs.acknowledge, {
        passOnLogId,
        userId: user.convexId,
        note: typeof body?.note === "string" ? body.note : undefined,
      }),
      { status: 201 },
    );
  }),
});

http.route({
  path: "/post-orders",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    return json(await ctx.runQuery(api.postOrders.listForUser, { userId: user.convexId }));
  }),
});

http.route({
  pathPrefix: "/post-orders/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id) return json({ message: "Post order route not found" }, { status: 404 });
    const orderId = await ctx.runQuery(api.postOrders.resolveId, { id });
    if (!orderId) return json({ message: "Post order not found" }, { status: 404 });
    if (action === "acknowledge") {
      return json(
        await ctx.runMutation(api.postOrders.acknowledge, {
          orderId,
          userId: user.convexId,
        }),
        { status: 201 },
      );
    }
    if (action === "complete") {
      const body = await parseJson(request);
      let proofPhotoUrl: string | undefined;
      if (typeof body?.photoBase64 === "string" && body.photoBase64) {
        const blob = base64ToBlob(body.photoBase64);
        const storageId = await ctx.storage.store(blob);
        proofPhotoUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
      }
      return json(
        await ctx.runMutation(api.postOrders.complete, {
          orderId,
          userId: user.convexId,
          proofNote: typeof body?.proofNote === "string" ? body.proofNote : undefined,
          gpsLatitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
          gpsLongitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
          proofPhotoUrl,
        }),
        { status: 201 },
      );
    }
    return json({ message: "Post order route not found" }, { status: 404 });
  }),
});

http.route({
  path: "/handovers/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    return json(await ctx.runQuery(api.handovers.listPendingForUser, { userId: user.convexId }));
  }),
});

http.route({
  path: "/handovers",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const body = await parseJson(request);
    const summary = String(body?.summary ?? "").trim();
    if (!summary) return json({ message: "summary is required" }, { status: 400 });
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    let photoUrl: string | undefined;
    if (typeof body?.photoBase64 === "string" && body.photoBase64) {
      const blob = base64ToBlob(body.photoBase64);
      const storageId = await ctx.storage.store(blob);
      photoUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
    }
    return json(
      await ctx.runMutation(api.handovers.create, {
        userId: user.convexId,
        summary,
        openIssues: typeof body?.openIssues === "string" ? body.openIssues : undefined,
        equipmentStatus:
          typeof body?.equipmentStatus === "string" ? body.equipmentStatus : undefined,
        siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : undefined,
        checkpointId,
        photoUrl,
      }),
      { status: 201 },
    );
  }),
});

http.route({
  pathPrefix: "/handovers/",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id || action !== "accept") {
      return json({ message: "Handover route not found" }, { status: 404 });
    }
    const handoverId = await ctx.runQuery(api.handovers.resolveId, { id });
    if (!handoverId) return json({ message: "Handover not found" }, { status: 404 });
    const body = await parseJson(request);
    return json(
      await ctx.runMutation(api.handovers.accept, {
        handoverId,
        userId: user.convexId,
        acceptedNote: typeof body?.acceptedNote === "string" ? body.acceptedNote : undefined,
      }),
    );
  }),
});

export default http;
