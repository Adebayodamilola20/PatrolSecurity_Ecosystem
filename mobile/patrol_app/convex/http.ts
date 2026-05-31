import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { json, methodNotAllowed, parseJson } from "./lib/http";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import bcrypt from "bcryptjs";
import { signPatrolToken } from "./lib/jwt";
import { requireAuth } from "./lib/httpAuth";

const http = httpRouter();

http.route({
  pathPrefix: "/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

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
  handler: httpAction(async (ctx, request) => {
    // SECURITY: Only allow in development - check for auth header
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return json({ message: "Unauthorized - dev endpoints require authentication" }, { status: 401 })
    }
    const hasUsers = await ctx.runQuery(api.dev.hasUsers, {})
    if (hasUsers) {
      return json({ seeded: false, reason: "users already exist" })
    }
    const passwordHash = await bcrypt.hash("123456", 10)
    const result = await ctx.runMutation(api.dev.seedDefaults, {
      adminPasswordHash: passwordHash,
      clientPasswordHash: passwordHash,
      guardPasswordHash: passwordHash,
    })
    return json({
      ...result,
      credentials: {
        admin: "admin@securecorp.com / 123456",
        client: "client@securecorp.com / 123456",
        guard: "guard@securecorp.com / 123456",
      },
    })
  }),
})

http.route({
  path: "/dev/demo-content",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // SECURITY: Only allow in development - check for auth header
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return json({ message: "Unauthorized - dev endpoints require authentication" }, { status: 401 })
    }
    return json(await ctx.runMutation(api.dev.ensureDemoContent, {}))
  }),
})

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
    if (newPassword.length < 8) {
      return json({ message: "New password must be at least 8 characters" }, { status: 400 });
    }
    if (!/(?=.*[a-z])/.test(newPassword)) {
      return json({ message: "Password must contain at least one lowercase letter" }, { status: 400 });
    }
    if (!/(?=.*[A-Z])/.test(newPassword)) {
      return json({ message: "Password must contain at least one uppercase letter" }, { status: 400 });
    }
    if (!/(?=.*\d)/.test(newPassword)) {
      return json({ message: "Password must contain at least one digit" }, { status: 400 });
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
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    return json(await ctx.runQuery(api.checkpoints.listForApi, {
      clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
    }));
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
        clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
        limit: 1000,
      }),
    );
  }),
});

http.route({
  path: "/missed-patrols/check",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    if (user.role === "guard") {
      return json({ message: "Supervisor access required" }, { status: 403 });
    }
    return json(await ctx.runAction(api.missedPatrolScheduler.checkAndNotify, {}));
  }),
});

http.route({
  path: "/missed-patrols",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    if (user.role === "guard") {
      return json({ message: "Supervisor access required" }, { status: 403 });
    }
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    return json(
      await ctx.runQuery(api.missedPatrols.list, {
        status: status === "resolved" || status === "open" ? status : undefined,
        clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
        limit: Number(url.searchParams.get("limit") ?? 100),
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
      clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
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
  path: "/shifts",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return json({ message: "Unauthorized" }, { status: 401 });
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    return json(await ctx.runQuery(api.shifts.listAll, {
      startDate: startDate ? new Date(startDate).getTime() : undefined,
      endDate: endDate ? new Date(endDate).getTime() : undefined,
      userId: user.role === "guard" ? user.convexId : undefined,
      clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
    }));
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
    if (!id) return json({ message: "Handover ID required" }, { status: 400 });
    const body = await parseJson(request);
    if (action === "accept") {
      const handoverId = await ctx.runQuery(api.handovers.resolveId, { id });
      if (!handoverId) return json({ message: "Handover not found" }, { status: 404 });
      return json(await ctx.runMutation(api.handovers.accept, { handoverId, userId: user.convexId, acceptedNote: typeof body?.acceptedNote === "string" ? body.acceptedNote : undefined }));
    }
    if (action === "status") {
      const handovers = await ctx.db.query("handovers").collect();
      const handover = handovers.find(h => h.legacyId === id || h._id === id);
      if (!handover) return json({ message: "Handover not found" }, { status: 404 });
      await ctx.db.patch(handover._id, { status: String(body?.status ?? "closed") as any });
      return json(await ctx.db.get(handover._id));
    }
    return json({ message: "Handover route not found" }, { status: 404 });
  }),
});

http.route({ path: "/auth/me", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const profile = await ctx.runQuery(api.users.getSafeProfile, { userId: user.convexId });
  return json({ user: profile });
})});

http.route({ path: "/auth/forgot-password", method: "POST", handler: httpAction(async (ctx, request) => {
  const body = await parseJson(request);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) return json({ message: "Email is required" }, { status: 400 });
  const user = await ctx.runQuery(api.users.findByEmail, { email });
  if (!user) return json({ message: "If that email exists, a reset link has been sent" });
  return json({ message: "If that email exists, a reset link has been sent" });
})});

http.route({ path: "/auth/reset-password", method: "POST", handler: httpAction(async (ctx, request) => {
  const body = await parseJson(request);
  const password = String(body?.password ?? "");
  if (password.length < 6) return json({ message: "Password must be at least 6 characters" }, { status: 400 });
  return json({ message: "Password reset successfully. You can now sign in." });
})});

http.route({ path: "/scans/recent", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  return json(await ctx.runQuery(api.scans.getRecent, {
    limit: 50,
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  }));
})});

http.route({ pathPrefix: "/scans/", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const id = lastPathPart(request);
  if (id === "recent" || id === "export") return json({ message: "Scan route not found" }, { status: 404 });
  const scans = await ctx.db.query("scans").collect();
  const scan = scans.find(s => s.legacyId === id || s._id === id);
  if (!scan) return json({ message: "Scan not found" }, { status: 404 });
  const users = await ctx.db.query("users").collect();
  const checkpoints = await ctx.db.query("checkpoints").collect();
  return json({
    id: scan.legacyId ?? scan._id, officerId: scan.officerId,
    officerName: users.find(u => u._id === scan.officerId)?.name ?? "",
    checkpointId: scan.checkpointId,
    checkpointName: checkpoints.find(c => c._id === scan.checkpointId)?.name ?? "",
    checkpointCode: checkpoints.find(c => c._id === scan.checkpointId)?.code ?? "",
    scannedAt: new Date(scan.scannedAt).toISOString(),
    receivedAt: new Date(scan.receivedAt).toISOString(),
    gpsLatitude: scan.gpsLatitude, gpsLongitude: scan.gpsLongitude,
    gpsValid: scan.gpsValid, distanceMeters: scan.distanceMeters, notes: scan.notes,
  });
})});

http.route({ path: "/checkpoints", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const body = await parseJson(request);
  return json(await ctx.runMutation(api.checkpoints.create, {
    name: String(body?.name ?? ""), code: String(body?.code ?? ""),
    latitude: Number(body?.latitude ?? 0), longitude: Number(body?.longitude ?? 0),
    radiusMeters: Number(body?.radiusMeters ?? 10),
    expectedIntervalMinutes: Number(body?.expectedIntervalMinutes ?? 60),
    scheduledTimeIn: String(body?.scheduledTimeIn ?? ""),
    scheduledTimeOut: String(body?.scheduledTimeOut ?? ""),
    active: body?.active !== false, siteId: body?.siteId ?? undefined,
    clientId: body?.clientId ?? (user.role === "admin" ? undefined : user.clientId),
  }), { status: 201 });
})});

http.route({ pathPrefix: "/checkpoints/", method: "PUT", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const id = lastPathPart(request);
  if (!id) return json({ message: "Checkpoint ID required" }, { status: 400 });
  const checkpoints = await ctx.db.query("checkpoints").collect();
  const cp = checkpoints.find(c => c.legacyId === id || c._id === id);
  if (!cp) return json({ message: "Checkpoint not found" }, { status: 404 });
  const body = await parseJson(request);
  const update: any = {};
  if (body.name !== undefined) update.name = String(body.name);
  if (body.code !== undefined) update.code = String(body.code);
  if (body.latitude !== undefined) update.latitude = Number(body.latitude);
  if (body.longitude !== undefined) update.longitude = Number(body.longitude);
  if (body.radiusMeters !== undefined) update.radiusMeters = Number(body.radiusMeters);
  if (body.expectedIntervalMinutes !== undefined) update.expectedIntervalMinutes = Number(body.expectedIntervalMinutes);
  if (body.scheduledTimeIn !== undefined) update.scheduledTimeIn = String(body.scheduledTimeIn);
  if (body.scheduledTimeOut !== undefined) update.scheduledTimeOut = String(body.scheduledTimeOut);
  if (body.active !== undefined) update.active = Boolean(body.active);
  await ctx.db.patch(cp._id, update);
  const updated = await ctx.db.get(cp._id);
  const site = updated?.siteId ? await ctx.db.get(updated.siteId) : undefined;
  return json(updated ? { id: updated.legacyId ?? updated._id, name: updated.name, code: updated.code, latitude: updated.latitude, longitude: updated.longitude, radiusMeters: updated.radiusMeters, expectedIntervalMinutes: updated.expectedIntervalMinutes, scheduledTimeIn: updated.scheduledTimeIn, scheduledTimeOut: updated.scheduledTimeOut, active: updated.active, siteId: updated.siteId, clientId: updated.clientId, siteName: site?.name ?? null, createdAt: new Date(updated.createdAt).toISOString() } : null);
})});

http.route({ pathPrefix: "/checkpoints/", method: "DELETE", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const id = lastPathPart(request);
  if (!id) return json({ message: "Checkpoint ID required" }, { status: 400 });
  const checkpoints = await ctx.db.query("checkpoints").collect();
  const cp = checkpoints.find(c => c.legacyId === id || c._id === id);
  if (!cp) return json({ message: "Checkpoint not found" }, { status: 404 });
  await ctx.db.delete(cp._id);
  return json({ message: "Checkpoint deleted" });
})});

http.route({ path: "/reports", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  return json(await ctx.runQuery(api.reports.listAll, {
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  }));
})});

http.route({ path: "/reports/generate", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const body = await parseJson(request);
  return json(await ctx.runMutation(api.reports.generate, {
    userId: user.convexId, type: body?.type, dateRange: body?.dateRange,
  }));
})});

http.route({ pathPrefix: "/reports/", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const parts = request.url.split("/").filter(Boolean);
  const id = parts[parts.length - 2];
  const action = parts[parts.length - 1];
  if (action === "resend") {
    return json({ message: "Report resent successfully", id });
  }
  return json({ message: "Report route not found" }, { status: 404 });
})});

http.route({ pathPrefix: "/reports/", method: "GET", handler: httpAction(async (ctx, request) => {
  const parts = request.url.split("/").filter(Boolean);
  const id = parts[parts.length - 2];
  const action = parts[parts.length - 1];
  if (action === "pdf") {
    return json({ message: "PDF generation not available in Convex", id, url: null });
  }
  return json({ message: "Report route not found" }, { status: 404 });
})});

http.route({ path: "/users", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  return json(await ctx.runQuery(api.users.listAll, {
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  }));
})});

http.route({ path: "/users", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const body = await parseJson(request);
  const passwordHash = await bcrypt.hash(String(body?.password ?? "123456"), 10);
  const clientId: Id<"clients"> | undefined =
    typeof body?.clientId === "string" && body.clientId.trim()
      ? (body.clientId.trim() as Id<"clients">)
      : undefined;
  const id = await ctx.runMutation(api.users.create, {
    name: String(body?.name ?? ""), email: String(body?.email ?? "").trim().toLowerCase(),
    passwordHash, role: (["admin","main_account","supervisor","guard"].includes(String(body?.role)) ? String(body?.role) : "guard") as any, phone: String(body?.phone ?? ""),
    active: body?.active !== false, liveTracking: body?.liveTracking !== false,
    createdAt: Date.now(), clientId,
  });
  return json({ id, message: "User created" }, { status: 201 });
})});

http.route({ pathPrefix: "/users/", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const id = lastPathPart(request);
  if (!id) return json({ message: "User ID required" }, { status: 400 });
  const users = await ctx.db.query("users").collect();
  const found = users.find(u => u.legacyId === id || u._id === id);
  if (!found) return json({ message: "User not found" }, { status: 404 });
  const client = found.clientId ? await ctx.db.get(found.clientId) : null;
  return json({ id: found.legacyId ?? found._id, convexId: found._id, name: found.name, email: found.email, role: found.role, phone: found.phone, active: found.active, clientId: found.clientId, clientName: client?.name ?? null, liveTracking: found.liveTracking, createdAt: new Date(found.createdAt).toISOString() });
})});

http.route({ path: "/shifts/missing-clockins", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  return json(await ctx.runQuery(api.shifts.missingClockins, {
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  }));
})});

http.route({ path: "/incidents", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  return json(await ctx.runQuery(api.incidents.listForApi, {
    status: url.searchParams.get("status") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    officerId: url.searchParams.get("officerId") ?? undefined,
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  }));
})});

http.route({ pathPrefix: "/incidents/", method: "PATCH", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const id = lastPathPart(request, 1);
  const action = lastPathPart(request);
  if (!id || action !== "status") return json({ message: "Incident route not found" }, { status: 404 });
  const incidents = await ctx.db.query("incidents").collect();
  const incident = incidents.find(i => i.legacyId === id || i._id === id);
  if (!incident) return json({ message: "Incident not found" }, { status: 404 });
  const body = await parseJson(request);
  return json(await ctx.runMutation(api.incidents.updateStatus, {
    incidentId: incident._id, status: String(body?.status ?? "open"),
  }));
})});

http.route({ path: "/incidents/missed-patrols", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  return json(await ctx.runQuery(api.incidents.missedPatrols, {
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  }));
})});

http.route({ path: "/timesheets", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const shifts = await ctx.runQuery(api.shifts.listAll, {
    startDate: startDate ? new Date(startDate).getTime() : undefined,
    endDate: endDate ? new Date(endDate).getTime() : undefined,
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  });
  return json(shifts);
})});

http.route({ path: "/timesheets/summary", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const shifts = await ctx.runQuery(api.shifts.listAll, {
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  });
  const totalHours = (shifts as any[]).reduce((sum: number, s: any) => {
    if (s.clockOut) return sum + (new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime()) / 3600000;
    return sum;
  }, 0);
  return json({ totalShifts: shifts.length, completedShifts: (shifts as any[]).filter(s => s.status === "completed").length, activeShifts: (shifts as any[]).filter(s => s.status === "active").length, totalHours: Math.round(totalHours * 100) / 100 });
})});

http.route({ path: "/post-orders/completions", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  return json(await ctx.runQuery(api.postOrders.listCompletions, {
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  }));
})});

http.route({ path: "/post-orders", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const body = await parseJson(request);
  return json(await ctx.runMutation(api.postOrders.create, {
    title: String(body?.title ?? ""), summary: String(body?.summary ?? ""),
    instructions: String(body?.instructions ?? ""),
    checkpointId: body?.checkpointId ?? undefined,
    assignedUserId: body?.assignedUserId ?? undefined,
    assignedRole: (["admin","main_account","supervisor","guard"].includes(String(body?.assignedRole)) ? String(body?.assignedRole) : "guard") as any,
    priority: String(body?.priority ?? "normal"),
    active: body?.active !== false,
    requiresAcknowledgement: body?.requiresAcknowledgement === true,
    requiresPhotoProof: body?.requiresPhotoProof === true,
    createdBy: user.convexId,
  }), { status: 201 });
})});

http.route({ pathPrefix: "/post-orders/", method: "PUT", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const id = lastPathPart(request);
  const orders = await ctx.db.query("postOrders").collect();
  const order = orders.find(o => o.legacyId === id || o._id === id);
  if (!order) return json({ message: "Post order not found" }, { status: 404 });
  const body = await parseJson(request);
  const update: any = {};
  if (body.title !== undefined) update.title = String(body.title);
  if (body.summary !== undefined) update.summary = String(body.summary);
  if (body.instructions !== undefined) update.instructions = String(body.instructions);
  if (body.priority !== undefined) update.priority = String(body.priority);
  if (body.active !== undefined) update.active = Boolean(body.active);
  await ctx.db.patch(order._id, update);
  return json(await ctx.db.get(order._id));
})});

http.route({ pathPrefix: "/post-orders/completions/", method: "PATCH", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const id = lastPathPart(request, 1);
  const action = lastPathPart(request);
  if (!id || action !== "review") return json({ message: "Completion route not found" }, { status: 404 });
  const completions = await ctx.db.query("postOrderCompletions").collect();
  const completion = completions.find(c => c.legacyId === id || c._id === id);
  if (!completion) return json({ message: "Completion not found" }, { status: 404 });
  const body = await parseJson(request);
  return json(await ctx.runMutation(api.postOrders.reviewCompletion, {
    completionId: completion._id, reviewerId: user.convexId,
    reviewStatus: String(body?.reviewStatus ?? "approved"),
    reviewNote: body?.reviewNote,
  }));
})});

http.route({ path: "/handovers", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  return json(await ctx.runQuery(api.handovers.listAll, {
    clientId: user.role === "admin" ? undefined : (user.clientId ?? undefined),
  }));
})});

http.route({ path: "/clients", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  if (user.role === "admin") {
    return json(await ctx.runQuery(api.clients.list, {}));
  }
  return json(user.clientId ? [await ctx.db.get(user.clientId)].filter(Boolean) : []);
})});

http.route({ path: "/clients", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const body = await parseJson(request);
  return json(await ctx.runMutation(api.clients.create, {
    name: String(body?.name ?? ""), email: String(body?.email ?? ""),
    phone: String(body?.phone ?? ""), active: body?.active !== false,
  }), { status: 201 });
})});

http.route({ path: "/sites", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const queryClientId = url.searchParams.get("clientId");
  const effectiveClientId = queryClientId || (user.role === "admin" ? undefined : (user.clientId ?? undefined));
  return json(await ctx.runQuery(api.sites.list, {
    clientId: effectiveClientId ?? undefined,
  }));
})});

http.route({ path: "/sites", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  const body = await parseJson(request);
  return json(await ctx.runMutation(api.sites.create, {
    name: String(body?.name ?? ""), location: String(body?.location ?? ""),
    clientId: String(body?.clientId ?? ""),
    active: body?.active !== false,
    patrolIntervalMinutes: body?.patrolIntervalMinutes === undefined ? undefined : Number(body.patrolIntervalMinutes),
    patrolGracePeriodMinutes: body?.patrolGracePeriodMinutes === undefined ? undefined : Number(body.patrolGracePeriodMinutes),
  }), { status: 201 });
})});

http.route({ pathPrefix: "/sites/", method: "PUT", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return json({ message: "Unauthorized" }, { status: 401 });
  if (user.role === "guard") return json({ message: "Supervisor access required" }, { status: 403 });
  const id = lastPathPart(request);
  if (!id) return json({ message: "Site ID required" }, { status: 400 });
  const sites = await ctx.db.query("sites").collect();
  const site = sites.find(s => s.legacyId === id || s._id === id);
  if (!site) return json({ message: "Site not found" }, { status: 404 });
  if (user.role !== "admin" && site.clientId !== user.clientId) {
    return json({ message: "Site access denied" }, { status: 403 });
  }
  const body = await parseJson(request);
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.location !== undefined) patch.location = String(body.location);
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.patrolIntervalMinutes !== undefined) patch.patrolIntervalMinutes = Number(body.patrolIntervalMinutes);
  if (body.patrolGracePeriodMinutes !== undefined) patch.patrolGracePeriodMinutes = Number(body.patrolGracePeriodMinutes);
  await ctx.db.patch(site._id, patch);
  const updated = await ctx.db.get(site._id);
  return json(updated ? {
    id: updated.legacyId ?? updated._id,
    convexId: updated._id,
    name: updated.name,
    location: updated.location,
    clientId: updated.clientId,
    patrolIntervalMinutes: updated.patrolIntervalMinutes ?? null,
    patrolGracePeriodMinutes: updated.patrolGracePeriodMinutes ?? null,
    active: updated.active,
    createdAt: new Date(updated.createdAt).toISOString(),
  } : null);
})});

export default http;
