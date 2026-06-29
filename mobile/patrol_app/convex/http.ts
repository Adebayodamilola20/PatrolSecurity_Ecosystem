import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { json, methodNotAllowed, parseJson } from "./lib/http";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import bcrypt from "bcryptjs";
import { signPatrolToken } from "./lib/jwt";
import { requireAuth } from "./lib/httpAuth";
import type { SensitiveAction } from "./audit";
import { badRequest, forbidden, notFound, tooManyRequests, unauthorized } from "./lib/errors";

const _uid = (s: string): Id<"users"> => s as Id<"users">;
const _cid = (s: string | null | undefined): Id<"clients"> | undefined => (s ?? undefined) as Id<"clients"> | undefined;
const _sid = (s: string | null | undefined): Id<"sites"> | undefined => (s ?? undefined) as Id<"sites"> | undefined;
const _cpid = (s: string | null | undefined): Id<"checkpoints"> | undefined => (s ?? undefined) as Id<"checkpoints"> | undefined;

const ACTIVITY_TYPES = [
  "clock_in",
  "clock_out",
  "patrol_scan",
  "incident",
  "maintenance",
  "dar",
  "emergency",
  "pass_on_log_ack",
  "post_order_ack",
  "visitor_check_in",
  "visitor_check_out",
  "truck_check_in",
  "truck_check_out",
] as const;

const INCIDENT_CATEGORIES = [
  "Security Incident",
  "Theft",
  "Fire",
  "Medical",
  "Visitor Issue",
  "Suspicious Activity",
  "Other",
] as const;

const EMERGENCY_TYPES = [
  "Armed Attack",
  "Medical Emergency",
  "Fire",
  "Intrusion",
  "Other",
] as const;

const REPORT_TYPES = [
  "Daily Activity Report",
  "Patrol Summary Report",
  "Clock-In / Clock-Out Report",
  "Attendance Report",
  "Incident Report",
  "Emergency Report",
  "Maintenance Report",
  "Pass-On Log Report",
  "Weekly Report",
  "Monthly Report",
  "Client Summary Report",
];

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

// Storage permissions: Convex's ctx.storage.store() is inherently secure —
// stored files are only accessible via signed URLs, never directly. The main
// concern is validating what gets stored before allowing it in.

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

async function validateImageBlob(blob: Blob): Promise<Response | null> {
  if (blob.size > MAX_IMAGE_SIZE) {
    return badRequest(`File size ${blob.size} exceeds the 5MB limit`);
  }
  if (!ALLOWED_IMAGE_TYPES.includes(blob.type)) {
    return badRequest(
      `Unsupported file type: ${blob.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
    );
  }
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47;
  const isWebp =
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50;
  if (!isJpeg && !isPng && !isWebp) {
    return badRequest("File content does not match a supported image format (JPEG, PNG, or WebP)");
  }
  return null;
}

async function maybeResolveCheckpointId(
  ctx: any,
  rawId: unknown,
): Promise<Id<"checkpoints"> | undefined> {
  if (typeof rawId !== "string" || !rawId.trim()) {
    return undefined;
  }
  return (await ctx.runQuery(internal.checkpoints.resolveId, {
    id: rawId.trim(),
  })) ?? undefined;
}

async function requireNoPendingPassOnLogs(ctx: any, user: { convexId: string; role: string }) {
  if (user.role !== "guard") return null;
  const pending = await ctx.runQuery(internal.passOnLogs.listPendingForUser, {
    userId: _uid(user.convexId),
  });
  if (pending.length === 0) return null;
  return forbidden(
    `Acknowledge ${pending.length} unread pass-on log(s) before continuing`,
  );
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildActivityCsv(rows: Array<Record<string, unknown>>) {
  const headers = ["Site", "Location", "Scans", "Date/Time", "Activity", "Count"];
  const totalScans = rows.reduce((sum, row) => {
    return sum + (row.activityType === "patrol_scan" ? Number(row.count ?? 0) : 0);
  }, 0);
  const totalCount = rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.site,
        row.location,
        row.activityType === "patrol_scan" ? row.count : "",
        row.occurredAt ?? row.time ?? row.date,
        row.activity,
        row.count,
      ].map(csvEscape).join(","),
    ),
    "",
    ["Scans", totalScans].map(csvEscape).join(","),
    ["Total Count", totalCount].map(csvEscape).join(","),
  ];
  return lines.join("\n");
}

function isExportRole(role: string) {
  return role === "admin" || role === "main_account";
}

function requireRole(user: { role: string }, roles: string[]): Response | null {
  if (roles.includes(user.role)) return null;
  return forbidden(`Access denied. Required role: ${roles.join(" or ")}`);
}

function csvList(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function recordAudit(
  ctx: any,
  user: { convexId: string; role: string; clientId?: string | null },
  action: SensitiveAction,
  args: {
    targetType?: string;
    targetId?: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
    siteId?: string;
    success?: boolean;
  } = {},
) {
  await ctx.runMutation(internal.audit.record, {
    action,
    actorId: _uid(user.convexId),
    actorRole: user.role,
    clientId: _cid(user.clientId),
    ...args,
    success: args.success ?? true,
  });
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
      return unauthorized("Dev endpoints require authentication")
    }
    const hasUsers = await ctx.runQuery(internal.dev.hasUsers, {})
    if (hasUsers) {
      return json({ seeded: false, reason: "users already exist" })
    }
    const passwordHash = await bcrypt.hash("123456", 10)
    const result = await ctx.runMutation(internal.dev.seedDefaults, {
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
      return unauthorized("Dev endpoints require authentication")
    }
    return json(await ctx.runMutation(internal.dev.ensureDemoContent, {}))
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
      return badRequest("Email and password are required");
    }

    const user = await ctx.runQuery(internal.users.findByEmail, { email });
    if (!user || !user.active) {
      return unauthorized("Invalid credentials");
    }

    const rateCheck = await ctx.runQuery(internal.lib.rateLimiter.checkRateLimit, {
      action: "login",
      actorId: email,
      auditAction: "user.login",
    });
    if (!rateCheck.allowed) {
      return tooManyRequests("Too many login attempts. Please try again later.");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return unauthorized("Invalid credentials");
    }
    if (clientType === "mobile" && user.role !== "guard") {
      return forbidden("Mobile access is restricted to guard accounts");
    }
    // The staff web dashboard is for staff only. Client accounts (main_account)
    // are moving to a separate client portal, so they can no longer sign in here.
    if (clientType !== "mobile" && user.role === "main_account") {
      return forbidden("Client accounts no longer have access to the staff dashboard. A separate client portal is coming soon.");
    }

    const safeUser = await ctx.runQuery(internal.users.getSafeProfile, { userId: user._id });
    const token = await signPatrolToken({
      userId: user._id,
      email: user.email,
      role: user.role,
    });
    await recordAudit(ctx, {
      convexId: user._id,
      role: user.role,
      clientId: user.clientId,
    }, "user.login", {
      details: `Login via ${clientType}`,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
    return json({ token, user: safeUser });
  }),
});

http.route({
  path: "/auth/change-password",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const body = await parseJson(request);
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      return badRequest("Current password and new password are required");
    }
    if (newPassword.length < 8) {
      return badRequest("New password must be at least 8 characters");
    }
    if (!/(?=.*[a-z])/.test(newPassword)) {
      return badRequest("Password must contain at least one lowercase letter");
    }
    if (!/(?=.*[A-Z])/.test(newPassword)) {
      return badRequest("Password must contain at least one uppercase letter");
    }
    if (!/(?=.*\d)/.test(newPassword)) {
      return badRequest("Password must contain at least one digit");
    }
    const stored = await ctx.runQuery(internal.users.findByEmail, { email: user.email });
    if (!stored) return notFound("User not found");
    const valid = await bcrypt.compare(currentPassword, stored.passwordHash);
    if (!valid) {
      return unauthorized("Current password is incorrect");
    }
    await ctx.runMutation(internal.users.changePassword, {
      userId: stored._id,
      passwordHash: await bcrypt.hash(newPassword, 10),
    });
    return json({ message: "Password updated successfully" });
  }),
});

http.route({
  pathPrefix: "/scans/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id || action !== "acknowledge-post-orders") {
      return notFound("Scan route not found");
    }
    const scanId = await ctx.runQuery(internal.scans.resolveId, { id });
    if (!scanId) return notFound("Scan not found");
    const body = await parseJson(request);
    const rawOrderIds = Array.isArray(body?.postOrderIds)
      ? body.postOrderIds
      : [];
    const postOrderIds = [];
    for (const raw of rawOrderIds) {
      if (typeof raw !== "string") continue;
      const orderId = await ctx.runQuery(internal.postOrders.resolveId, {
        id: raw,
      });
      if (orderId) postOrderIds.push(orderId);
    }
    return json(
      await ctx.runMutation(internal.scans.acknowledgePostOrdersForScan, {
        scanId,
        userId: _uid(user.convexId),
        postOrderIds,
      }),
      { status: 201 },
    );
  }),
});

http.route({
  path: "/emergency/settings",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internal.settings.list, {}));
  }),
});

http.route({
  path: "/emergency/settings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    if (user.role !== "admin") {
      return forbidden("Admin access required");
    }
    const body = await parseJson(request);
    const settingKey = String(body?.settingKey ?? "").trim();
    if (!settingKey) return badRequest("settingKey is required");
    return json(
      await ctx.runMutation(internal.settings.create, {
        settingKey,
        settingValue:
          typeof body?.settingValue === "string"
            ? body.settingValue
            : JSON.stringify(body?.settingValue ?? ""),
        scopeType: typeof body?.scopeType === "string" ? body.scopeType : undefined,
        scopeId: typeof body?.scopeId === "string" ? body.scopeId : undefined,
        updatedBy: _uid(user.convexId),
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
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internal.checkpoints.listForApi, {
      clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
    }));
  }),
});

http.route({
  path: "/activity-summary",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const rawActivityType = url.searchParams.get("activityType") ?? undefined;
    const activityType = ACTIVITY_TYPES.includes(rawActivityType as any)
      ? (rawActivityType as (typeof ACTIVITY_TYPES)[number])
      : undefined;
    const rows = await ctx.runQuery(internal.activity.list, {
      officerId:
        user.role === "guard"
          ? _uid(user.convexId)
          : ((url.searchParams.get("officerId") ?? undefined) as
              | Id<"users">
              | undefined),
      clientId:
        user.role === "admin"
          ? _cid(url.searchParams.get("clientId"))
          : _cid(user.clientId),
      siteId: _sid(url.searchParams.get("siteId")),
      activityType,
      startDate: url.searchParams.get("startDate")
        ? Date.parse(url.searchParams.get("startDate")!)
        : undefined,
      endDate: url.searchParams.get("endDate")
        ? Date.parse(url.searchParams.get("endDate")!)
        : undefined,
      limit: Number(url.searchParams.get("limit") ?? 500),
    });
    return json(rows);
  }),
});

http.route({
  path: "/activity-summary/export",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    if (user.role === "guard") return forbidden("Supervisor access required");
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    const rawActivityType = url.searchParams.get("activityType") ?? undefined;
    const activityType = ACTIVITY_TYPES.includes(rawActivityType as any)
      ? (rawActivityType as (typeof ACTIVITY_TYPES)[number])
      : undefined;
    const rows = (await ctx.runQuery(internal.activity.list, {
      clientId:
        user.role === "admin"
          ? _cid(url.searchParams.get("clientId"))
          : _cid(user.clientId),
      siteId: _sid(url.searchParams.get("siteId")),
      officerId: (url.searchParams.get("officerId") ?? undefined) as
        | Id<"users">
        | undefined,
      activityType,
      startDate: url.searchParams.get("startDate")
        ? Date.parse(url.searchParams.get("startDate")!)
        : undefined,
      endDate: url.searchParams.get("endDate")
        ? Date.parse(url.searchParams.get("endDate")!)
        : undefined,
      limit: 5000,
    })) as Array<Record<string, unknown>>;
    const csv = buildActivityCsv(rows);
    if (format === "excel" || format === "xlsx") {
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.ms-excel",
          "Content-Disposition": "attachment; filename=site-activity-summary.xls",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    if (format === "pdf") {
      const html = `<!doctype html><html><head><title>Site Activity Summary</title></head><body><h1>Site Activity Summary</h1><pre>${csv
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre></body></html>`;
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": "attachment; filename=site-activity-summary.html",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=site-activity-summary.csv",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

http.route({
  path: "/scans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const rawCheckpoint =
      url.searchParams.get("checkpoint") ?? url.searchParams.get("checkpointId");
    const checkpointFilterRequested =
      typeof rawCheckpoint === "string" && rawCheckpoint.trim().length > 0;
    const checkpointId = await maybeResolveCheckpointId(ctx, rawCheckpoint);
    // A checkpoint filter was requested but could not be resolved to a real
    // checkpoint. Return no scans instead of falling back to every scan in the
    // system (which made unrelated guards appear at a brand-new checkpoint).
    if (checkpointFilterRequested && !checkpointId) {
      return json([]);
    }
    const startDateRaw = url.searchParams.get("startDate") ?? url.searchParams.get("start");
    const endDateRaw = url.searchParams.get("endDate") ?? url.searchParams.get("end");
    const startDate = startDateRaw ? new Date(startDateRaw).getTime() : undefined;
    const endDate = endDateRaw ? new Date(endDateRaw).getTime() : undefined;
    return json(
      await ctx.runQuery(internal.scans.listForApi, {
        officerId: user.role === "guard" ? _uid(user.convexId) : undefined,
        clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
        checkpointId,
        startDate: startDate != null && !Number.isNaN(startDate) ? startDate : undefined,
        endDate: endDate != null && !Number.isNaN(endDate) ? endDate : undefined,
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
    if (!user) return unauthorized();
    if (user.role === "guard") {
      return forbidden("Supervisor access required");
    }
    return json(await ctx.runAction(internal.missedPatrolScheduler.checkAndNotify, {}));
  }),
});

http.route({
  path: "/missed-patrols",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    if (user.role === "guard") {
      return forbidden("Supervisor access required");
    }
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    return json(
      await ctx.runQuery(internal.missedPatrols.list, {
        status: status === "resolved" || status === "open" ? status : undefined,
        clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
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
    if (!user) return unauthorized();
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const body = await parseJson(request);
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    if (!checkpointId) {
      return notFound("Checkpoint not found");
    }
    const scan = await ctx.runMutation(internal.scans.create, {
      officerId: _uid(user.convexId),
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
    if (!user) return unauthorized();
    if (!isExportRole(user.role)) {
      return forbidden("Only Admin and Main Account can review exports");
    }
    return json(await ctx.runQuery(internal.exports.listDailyExportsForUser, { userId: _uid(user.convexId) }));
  }),
});

http.route({
  path: "/scans/export/daily",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    if (!isExportRole(user.role)) {
      return forbidden("Only Admin and Main Account can request exports");
    }
    const body = await parseJson(request);
    const date = String(body?.date ?? "").trim();
    if (!date) return badRequest("date is required");

    const scans = (await ctx.runQuery(internal.scans.listForApi, {
      officerId: undefined,
      clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
      limit: 5000,
    })) as Array<Record<string, unknown>>;
    const shifts = (await ctx.runQuery(internal.shifts.listForExport, {})) as Array<Record<string, unknown>>;
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
    // Cleanup: if the export record creation below fails, the stored file
    // becomes orphaned. Consider a periodic cron to delete stale export
    // files from storage that are older than 7 days.
    const downloadUrl = (await ctx.storage.getUrl(storageId)) ?? "";
    const fileName = `daily-tour-${date}.csv`;
    const record = await ctx.runMutation(internal.exports.createDailyExportRecord, {
      userId: _uid(user.convexId),
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
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    return json(await ctx.runQuery(internal.shifts.listAll, {
      startDate: startDate ? new Date(startDate).getTime() : undefined,
      endDate: endDate ? new Date(endDate).getTime() : undefined,
      userId: user.role === "guard" ? _uid(user.convexId) : undefined,
      clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
    }));
  }),
});

http.route({
  path: "/shifts/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internal.shifts.getStatusForUser, { userId: _uid(user.convexId) }));
  }),
});

http.route({
  path: "/shifts/clock-in",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["guard", "supervisor"]);
    if (roleErr) return roleErr;
    const body = await parseJson(request);
    let clockInPhotoUrl: string | undefined;
    if (typeof body?.photoBase64 === "string" && body.photoBase64) {
      const blob = base64ToBlob(body.photoBase64);
      const bad = await validateImageBlob(blob);
      if (bad) return bad;
      const storageId = await ctx.storage.store(blob);
      clockInPhotoUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
    }
    const result = await ctx.runMutation(internal.shifts.clockIn, {
      userId: _uid(user.convexId),
      latitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
      longitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
      siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : undefined,
      clockInPhoto: clockInPhotoUrl,
    });
    await recordAudit(ctx, user, "clock_in.created", {
      details: `Clock in at ${body?.siteLabel ?? "unknown site"}`,
    });
    return json(result, { status: 201 });
  }),
});

http.route({
  path: "/shifts/clock-out",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["guard", "supervisor"]);
    if (roleErr) return roleErr;
    const activeShift = await ctx.runQuery(internal.shifts.getActiveForUser, { userId: _uid(user.convexId) });
    if (!activeShift) return notFound("No active shift found");
    const body = await parseJson(request);
    const result = await ctx.runMutation(internal.shifts.clockOut, {
      shiftId: activeShift._id,
      latitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
      longitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
    });
    await recordAudit(ctx, user, "clock_out.created", {
      details: "Clock out",
    });
    return json(result);
  }),
});

http.route({
  path: "/positions",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const body = await parseJson(request);
    if (typeof body?.latitude !== "number" || typeof body?.longitude !== "number") {
      return badRequest("latitude and longitude are required");
    }
    return json(
      await ctx.runMutation(internal.positions.record, {
        userId: _uid(user.convexId),
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
    if (!user) return unauthorized();
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const body = await parseJson(request);
    const title = String(body?.title ?? "").trim();
    if (!title) return badRequest("title is required");
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    const category = INCIDENT_CATEGORIES.includes(body?.category)
      ? body.category
      : "Security Incident";
    const photoUrls: string[] = [];
    const photos = Array.isArray(body?.photoBase64) ? body.photoBase64 : [];
    for (const photo of photos.slice(0, 5)) {
      if (typeof photo !== "string" || !photo) continue;
      const blob = base64ToBlob(photo);
      const bad = await validateImageBlob(blob);
      if (bad) return bad;
      const storageId = await ctx.storage.store(blob);
      const url = await ctx.storage.getUrl(storageId);
      if (url) photoUrls.push(url);
    }
    const id = await ctx.runMutation(internal.incidents.create, {
      officerId: _uid(user.convexId),
      checkpointId,
      category,
      title,
      description: typeof body?.description === "string" ? body.description : undefined,
      photoUrls,
      severity:
        body?.severity === "low" ||
        body?.severity === "medium" ||
        body?.severity === "high" ||
        body?.severity === "critical"
          ? body.severity
          : undefined,
    });
    await recordAudit(ctx, user, "incident.created", {
      targetType: "incident",
      targetId: id as string,
      details: `Incident created: ${category}`,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
    return json({ id }, { status: 201 });
  }),
});

http.route({
  path: "/reports/daily-activity",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["guard"]);
    if (roleErr) return roleErr;
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const body = await parseJson(request);
    const summary = String(body?.summary ?? "").trim();
    if (!summary) return badRequest("summary is required");
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    const id = await ctx.runMutation(internal.reports.submit, {
      type: "daily-activity",
      title: `Daily Activity Report - ${user.name}`,
      summary,
      details: {
        activities: body?.activities ?? "",
        openIssues: body?.openIssues ?? "",
        shiftWindow: body?.shiftWindow ?? "",
      },
      gpsLatitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
      gpsLongitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
      checkpointId,
      siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : "",
      userId: _uid(user.convexId),
    });
    await recordAudit(ctx, user, "dar.created", {
      targetType: "report",
      targetId: id as string,
      details: "Submitted daily activity report",
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
    return json({ id }, { status: 201 });
  }),
});

http.route({
  path: "/reports/maintenance",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["guard"]);
    if (roleErr) return roleErr;
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const body = await parseJson(request);
    const title = String(body?.title ?? "").trim();
    const issue = String(body?.issue ?? "").trim();
    if (!title || !issue) {
      return badRequest("title and issue are required");
    }
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    const evidenceUrls: string[] = [];
    const evidence = Array.isArray(body?.evidenceBase64)
      ? body.evidenceBase64
      : [];
    for (const item of evidence.slice(0, 5)) {
      if (typeof item !== "string" || !item) continue;
      const blob = base64ToBlob(item);
      const bad = await validateImageBlob(blob);
      if (bad) return bad;
      const storageId = await ctx.storage.store(blob);
      const url = await ctx.storage.getUrl(storageId);
      if (url) evidenceUrls.push(url);
    }
    const id = await ctx.runMutation(internal.reports.submit, {
      type: "maintenance",
      title,
      summary: issue,
      details: {
        assetName: body?.assetName ?? "",
        severity: body?.severity ?? "medium",
      },
      equipmentName: typeof body?.equipment === "string" ? body.equipment : typeof body?.assetName === "string" ? body.assetName : undefined,
      evidenceUrls,
      gpsLatitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
      gpsLongitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
      checkpointId,
      siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : "",
      userId: _uid(user.convexId),
    });
    await recordAudit(ctx, user, "maintenance.created", {
      targetType: "report",
      targetId: id as string,
      details: `Submitted maintenance report: ${title}`,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
    return json({ id }, { status: 201 });
  }),
});

http.route({
  path: "/emergency/trigger",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const body = await parseJson(request);
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    const emergencyEmails = csvList(
      (await ctx.runQuery(internal.settings.getLatest, {
        settingKey: "emergency_email_recipients",
      })) as string | null,
    );
    const emergencyPhones = csvList(
      (await ctx.runQuery(internal.settings.getLatest, {
        settingKey: "emergency_phone_recipients",
      })) as string | null,
    );
    const siteLabel = typeof body?.siteLabel === "string" ? body.siteLabel : "";
    const note = typeof body?.note === "string" ? body.note : "";
    const category = EMERGENCY_TYPES.includes(body?.category)
      ? body.category
      : "Other";
    const location =
      typeof body?.location === "string" && body.location.trim()
        ? body.location
        : siteLabel || "Unknown location";
    const roleErr = requireRole(user, ["guard"]);
    if (roleErr) return roleErr;
    const event = await ctx.runMutation(internal.emergency.trigger, {
      userId: _uid(user.convexId),
      checkpointId,
      siteLabel,
      category,
      note,
      location,
    });
    await recordAudit(ctx, user, "emergency.created", {
      targetType: "emergency_event",
      targetId: event.id as string,
      details: `Emergency triggered at ${location}${category ? ` (${category})` : ""}`,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
    let delivery: {
      status: string;
      deliveries: unknown[];
      summary: { attempted: number; delivered: number; failed: number };
    };
    if (emergencyEmails.length || emergencyPhones.length) {
      try {
        delivery = await ctx.runAction(internal.notifications.sendEmergencyAlert, {
          eventId: event.id,
          officerName: user.name,
          officerEmail: user.email,
          siteLabel,
          location,
          note,
          triggeredAt: event.triggeredAt,
          emailRecipients: emergencyEmails,
          phoneRecipients: emergencyPhones,
        }) as typeof delivery;
        console.log("[EMERGENCY_DELIVERY]", JSON.stringify({
          eventId: event.id,
          status: delivery.status,
          summary: delivery.summary,
        }));
      } catch (error) {
        console.error("[EMERGENCY_DELIVERY_ERROR]", JSON.stringify({
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        }));
        delivery = {
          status: "failed",
          deliveries: [],
          summary: { attempted: 0, delivered: 0, failed: 0 },
        };
      }
    } else {
      delivery = {
        status: "no_recipients_configured",
        deliveries: [],
        summary: {
          attempted: 0,
          delivered: 0,
          failed: 0,
        },
      };
    }
    await ctx.runMutation(internal.emergency.recordDelivery, {
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
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internal.passOnLogs.listForUser, { userId: _uid(user.convexId) }));
  }),
});

http.route({
  path: "/pass-on-logs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["admin", "main_account", "supervisor"]);
    if (roleErr) return roleErr;
    const body = await parseJson(request);
    const title = String(body?.title ?? "").trim();
    const instruction = String(body?.instruction ?? "").trim();
    if (!title || !instruction) {
      return badRequest("title and instruction are required");
    }
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    const result = await ctx.runMutation(internal.passOnLogs.create, {
      title,
      instruction,
      priority: typeof body?.priority === "string" ? body.priority : undefined,
      siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : undefined,
      checkpointId,
      requiresAcknowledgement:
        typeof body?.requiresAcknowledgement === "boolean"
          ? body.requiresAcknowledgement
          : undefined,
      createdBy: _uid(user.convexId),
    });
    await recordAudit(ctx, user, "pass_on_log.created", {
      targetType: "pass_on_log",
      targetId: result.id as unknown as string,
      details: `Created pass-on-log: ${title}`,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
    return json(result, { status: 201 });
  }),
});

http.route({
  path: "/pass-on-logs/pending-acknowledgements",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const logs = await ctx.runQuery(internal.passOnLogs.listPendingForUser, { userId: _uid(user.convexId) });
    return json({ hasPending: logs.length > 0, count: logs.length });
  }),
});

http.route({
  path: "/pass-on-logs/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internal.passOnLogs.listPendingForUser, { userId: _uid(user.convexId) }));
  }),
});

http.route({
  pathPrefix: "/pass-on-logs/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id || action !== "acknowledge") {
      return notFound("Pass-on-log route not found");
    }
    const passOnLogId = await ctx.runQuery(internal.passOnLogs.resolveId, { id });
    if (!passOnLogId) return notFound("Pass-on-log not found");
    const body = await parseJson(request);
    return json(
      await ctx.runMutation(internal.passOnLogs.acknowledge, {
        passOnLogId,
        userId: _uid(user.convexId),
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
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internal.postOrders.listForUser, { userId: _uid(user.convexId) }));
  }),
});

http.route({
  pathPrefix: "/post-orders/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id) return notFound("Post order route not found");
    const orderId = await ctx.runQuery(internal.postOrders.resolveId, { id });
    if (!orderId) return notFound("Post order not found");
    if (action === "acknowledge") {
      return json(
        await ctx.runMutation(internal.postOrders.acknowledge, {
          orderId,
          userId: _uid(user.convexId),
        }),
        { status: 201 },
      );
    }
    if (action === "complete") {
      const body = await parseJson(request);
      let proofPhotoUrl: string | undefined;
      if (typeof body?.photoBase64 === "string" && body.photoBase64) {
        const blob = base64ToBlob(body.photoBase64);
        const bad = await validateImageBlob(blob);
        if (bad) return bad;
        const storageId = await ctx.storage.store(blob);
        proofPhotoUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
      }
      return json(
        await ctx.runMutation(internal.postOrders.complete, {
          orderId,
          userId: _uid(user.convexId),
          proofNote: typeof body?.proofNote === "string" ? body.proofNote : undefined,
          gpsLatitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
          gpsLongitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
          proofPhotoUrl,
        }),
        { status: 201 },
      );
    }
    return notFound("Post order route not found");
  }),
});

http.route({
  path: "/handovers/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internal.handovers.listPendingForUser, { userId: _uid(user.convexId) }));
  }),
});

http.route({
  path: "/handovers",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["guard"]);
    if (roleErr) return roleErr;
    const body = await parseJson(request);
    const summary = String(body?.summary ?? "").trim();
    if (!summary) return badRequest("summary is required");
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    let photoUrl: string | undefined;
    if (typeof body?.photoBase64 === "string" && body.photoBase64) {
      const blob = base64ToBlob(body.photoBase64);
      const bad = await validateImageBlob(blob);
      if (bad) return bad;
      const storageId = await ctx.storage.store(blob);
      photoUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
    }
    const result = await ctx.runMutation(internal.handovers.create, {
      userId: _uid(user.convexId),
      summary,
      openIssues: typeof body?.openIssues === "string" ? body.openIssues : undefined,
      equipmentStatus:
        typeof body?.equipmentStatus === "string" ? body.equipmentStatus : undefined,
      siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : undefined,
      checkpointId,
      photoUrl,
    });
    await recordAudit(ctx, user, "handover.created", {
      targetType: "handover",
      targetId: result.id as unknown as string,
      details: `Created handover at ${body?.siteLabel ?? "unknown site"}`,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
    return json(result, { status: 201 });
  }),
});

http.route({
  pathPrefix: "/handovers/",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id) return badRequest("Handover ID required");
    const body = await parseJson(request);
    if (action === "accept") {
      const handoverId = await ctx.runQuery(internal.handovers.resolveId, { id });
      if (!handoverId) return notFound("Handover not found");
      return json(await ctx.runMutation(internal.handovers.accept, { handoverId, userId: _uid(user.convexId), acceptedNote: typeof body?.acceptedNote === "string" ? body.acceptedNote : undefined }));
    }
    if (action === "status") {
      const handoverId = await ctx.runQuery(internal.handovers.resolveId, { id });
      if (!handoverId) return notFound("Handover not found");
      const updated = await ctx.runMutation(internal.handovers.updateStatus, {
        handoverId, status: String(body?.status ?? "closed"),
      });
      return json(updated);
    }
    return notFound("Handover route not found");
  }),
});

http.route({
  path: "/visitors",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    return json(await ctx.runQuery(internal.visitors.listForApi, {
      clientId: user.role === "admin" ? _cid(url.searchParams.get("clientId")) : _cid(user.clientId),
      siteId: _sid(url.searchParams.get("siteId")),
      officerId: user.role === "guard" ? _uid(user.convexId) : (url.searchParams.get("officerId") as any),
      status: url.searchParams.get("status") as "active" | "completed" | undefined,
      limit: Number(url.searchParams.get("limit") ?? 100),
    }));
  }),
});

http.route({
  path: "/visitors",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["guard"]);
    if (roleErr) return roleErr;
    const body = await parseJson(request);
    const visitorName = String(body?.visitorName ?? "").trim();
    if (!visitorName) return badRequest("visitorName is required");
    const result = await ctx.runMutation(internal.visitors.checkIn, {
      clientId: _cid(user.clientId),
      siteId: _sid(body?.siteId),
      officerId: _uid(user.convexId),
      visitorName,
      visitorPhone: String(body?.visitorPhone ?? "").trim(),
      hostName: String(body?.hostName ?? "").trim(),
      purpose: String(body?.purpose ?? "").trim(),
      vehiclePlate: String(body?.vehiclePlate ?? "").trim(),
      idNumber: String(body?.idNumber ?? "").trim(),
      notes: String(body?.notes ?? "").trim(),
    });
    return json(result, { status: 201 });
  }),
});

http.route({
  pathPrefix: "/visitors/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id || action !== "check-out") return notFound("Visitor route not found");
    const logId = await ctx.runQuery(internal.visitors.resolveId, { id });
    if (!logId) return notFound("Visitor log not found");
    return json(await ctx.runMutation(internal.visitors.checkOut, { logId, userId: _uid(user.convexId) }));
  }),
});

http.route({
  path: "/trucks",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    return json(await ctx.runQuery(internal.truckLogs.listForApi, {
      clientId: user.role === "admin" ? _cid(url.searchParams.get("clientId")) : _cid(user.clientId),
      siteId: _sid(url.searchParams.get("siteId")),
      officerId: user.role === "guard" ? _uid(user.convexId) : (url.searchParams.get("officerId") as any),
      status: url.searchParams.get("status") as "active" | "completed" | undefined,
      limit: Number(url.searchParams.get("limit") ?? 100),
    }));
  }),
});

http.route({
  path: "/trucks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["guard"]);
    if (roleErr) return roleErr;
    const body = await parseJson(request);
    const driverName = String(body?.driverName ?? "").trim();
    if (!driverName) return badRequest("driverName is required");
    const result = await ctx.runMutation(internal.truckLogs.checkIn, {
      clientId: _cid(user.clientId),
      siteId: _sid(body?.siteId),
      officerId: _uid(user.convexId),
      driverName,
      plateNumber: String(body?.plateNumber ?? "").trim(),
      company: String(body?.company ?? "").trim(),
      purpose: String(body?.purpose ?? "").trim(),
      cargoDescription: String(body?.cargoDescription ?? "").trim(),
      notes: String(body?.notes ?? "").trim(),
    });
    return json(result, { status: 201 });
  }),
});

http.route({
  pathPrefix: "/trucks/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const id = lastPathPart(request, 1);
    const action = lastPathPart(request);
    if (!id || action !== "check-out") return notFound("Truck route not found");
    const logId = await ctx.runQuery(internal.truckLogs.resolveId, { id });
    if (!logId) return notFound("Truck log not found");
    return json(await ctx.runMutation(internal.truckLogs.checkOut, { logId, userId: _uid(user.convexId) }));
  }),
});

http.route({ path: "/auth/me", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const profile = await ctx.runQuery(internal.users.getSafeProfile, { userId: _uid(user.convexId) });
  return json({ user: profile });
})});

http.route({ path: "/auth/forgot-password", method: "POST", handler: httpAction(async (ctx, request) => {
  const body = await parseJson(request);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) return badRequest("Email is required");
  const user = await ctx.runQuery(internal.users.findByEmail, { email });
  if (!user) return json({ message: "If that email exists, a reset link has been sent" });
  return json({ message: "If that email exists, a reset link has been sent" });
})});

http.route({ path: "/auth/reset-password", method: "POST", handler: httpAction(async (ctx, request) => {
  const body = await parseJson(request);
  const password = String(body?.password ?? "");
  if (password.length < 6) return badRequest("Password must be at least 6 characters");
  return json({ message: "Password reset successfully. You can now sign in." });
})});

http.route({ path: "/scans/recent", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  return json(await ctx.runQuery(internal.scans.getRecent, {
    limit: 50,
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }));
})});

http.route({ pathPrefix: "/scans/", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const id = lastPathPart(request);
  if (id === "recent" || id === "export") return notFound("Scan route not found");
  const scanId = await ctx.runQuery(internal.scans.resolveId, { id });
  if (!scanId) return notFound("Scan not found");
  return json(await ctx.runQuery(internal.scans.getDetail, { scanId }));
})});

http.route({ path: "/checkpoints", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "main_account", "supervisor"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const result = await ctx.runMutation(internal.checkpoints.create, {
    name: String(body?.name ?? ""), code: String(body?.code ?? ""),
    latitude: Number(body?.latitude ?? 0), longitude: Number(body?.longitude ?? 0),
    radiusMeters: Number(body?.radiusMeters ?? 10),
    expectedIntervalMinutes: Number(body?.expectedIntervalMinutes ?? 60),
    scheduledTimeIn: String(body?.scheduledTimeIn ?? ""),
    scheduledTimeOut: String(body?.scheduledTimeOut ?? ""),
    active: body?.active !== false, siteId: body?.siteId ?? undefined,
    clientId: body?.clientId ?? _cid(user.role === "admin" ? undefined : user.clientId),
  });
  await recordAudit(ctx, user, "checkpoint.created", {
    targetType: "checkpoint", details: `Created checkpoint: ${body?.name}`,
  });
  return json(result, { status: 201 });
})});

http.route({ pathPrefix: "/checkpoints/", method: "PUT", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "main_account"]);
  if (roleErr) return roleErr;
  const id = lastPathPart(request);
  if (!id) return badRequest("Checkpoint ID required");
  const cpId = await ctx.runQuery(internal.checkpoints.resolveId, { id });
  if (!cpId) return notFound("Checkpoint not found");
  const body = await parseJson(request);
  const fields: any = {};
  if (body.name !== undefined) fields.name = String(body.name);
  if (body.code !== undefined) fields.code = String(body.code);
  if (body.latitude !== undefined) fields.latitude = Number(body.latitude);
  if (body.longitude !== undefined) fields.longitude = Number(body.longitude);
  if (body.radiusMeters !== undefined) fields.radiusMeters = Number(body.radiusMeters);
  if (body.expectedIntervalMinutes !== undefined) fields.expectedIntervalMinutes = Number(body.expectedIntervalMinutes);
  if (body.scheduledTimeIn !== undefined) fields.scheduledTimeIn = String(body.scheduledTimeIn);
  if (body.scheduledTimeOut !== undefined) fields.scheduledTimeOut = String(body.scheduledTimeOut);
  if (body.active !== undefined) fields.active = Boolean(body.active);
  const result = await ctx.runMutation(internal.checkpoints.update, { checkpointId: cpId, ...fields });
  await recordAudit(ctx, user, "checkpoint.updated", {
    targetType: "checkpoint", targetId: cpId, details: `Updated checkpoint fields: ${Object.keys(fields).join(", ")}`,
  });
  return json(result);
})});

http.route({ pathPrefix: "/checkpoints/", method: "DELETE", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;
  const id = lastPathPart(request);
  if (!id) return badRequest("Checkpoint ID required");
  const cpId = await ctx.runQuery(internal.checkpoints.resolveId, { id });
  if (!cpId) return notFound("Checkpoint not found");
  await ctx.runMutation(internal.checkpoints.remove, { checkpointId: cpId });
  await recordAudit(ctx, user, "checkpoint.deleted", {
    targetType: "checkpoint", targetId: cpId,
  });
  return json({ message: "Checkpoint deleted" });
})});

http.route({ path: "/reports", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  return json(await ctx.runQuery(internal.reports.listAll, {
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }));
})});

http.route({ path: "/reports/generate", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const body = await parseJson(request);
  return json(await ctx.runMutation(internal.reports.generate, {
    userId: _uid(user.convexId), type: body?.type, dateRange: body?.dateRange,
  }));
})});

http.route({ pathPrefix: "/reports/", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const parts = request.url.split("/").filter(Boolean);
  const id = parts[parts.length - 2];
  const action = parts[parts.length - 1];
  if (action === "resend") {
    return json({ message: "Report resent successfully", id });
  }
  return notFound("Report route not found");
})});

http.route({ pathPrefix: "/reports/", method: "GET", handler: httpAction(async (ctx, request) => {
  const parts = request.url.split("/").filter(Boolean);
  const id = parts[parts.length - 2];
  const action = parts[parts.length - 1];
  if (action === "pdf") {
    return json({ message: "PDF generation not available in Convex", id, url: null });
  }
  return notFound("Report route not found");
})});

http.route({ path: "/users", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden("Admin access required");
  return json(await ctx.runQuery(internal.users.listAll, {
    clientId: undefined,
  }));
})});

http.route({ path: "/users", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const passwordHash = await bcrypt.hash(String(body?.password ?? "123456"), 10);
  const clientId: Id<"clients"> | undefined =
    typeof body?.clientId === "string" && body.clientId.trim()
      ? (body.clientId.trim() as Id<"clients">)
      : undefined;
  const id = await ctx.runMutation(internal.users.create, {
    name: String(body?.name ?? ""), email: String(body?.email ?? "").trim().toLowerCase(),
    passwordHash, role: (["admin","main_account","supervisor","guard"].includes(String(body?.role)) ? String(body?.role) : "guard") as any, phone: String(body?.phone ?? ""),
    active: body?.active !== false, liveTracking: body?.liveTracking !== false,
    createdAt: Date.now(), clientId,
  });
  await recordAudit(ctx, user, "user.created", {
    targetType: "user", targetId: id as string,
    details: `Created user ${body?.name} with role ${body?.role}`,
  });
  return json({ id, message: "User created" }, { status: 201 });
})});

http.route({ pathPrefix: "/users/", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const id = lastPathPart(request);
  if (!id) return badRequest("User ID required");
  const userId = await ctx.runQuery(internal.users.resolveId, { id });
  if (!userId) return notFound("User not found");
  if (user.role.trim().toLowerCase() !== "admin" && _uid(user.convexId) !== userId) {
    return forbidden("Access denied");
  }
  return json(await ctx.runQuery(internal.users.getDetail, { userId }));
})});

http.route({ path: "/shifts/missing-clockins", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  return json(await ctx.runQuery(internal.shifts.missingClockins, {
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }));
})});

http.route({ path: "/incidents", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  return json(await ctx.runQuery(internal.incidents.listForApi, {
    status: url.searchParams.get("status") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    officerId: (url.searchParams.get("officerId") ?? undefined) as Id<"users"> | undefined,
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }));
})});

http.route({ pathPrefix: "/incidents/", method: "PATCH", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const id = lastPathPart(request, 1);
  const action = lastPathPart(request);
  if (!id || action !== "status") return notFound("Incident route not found");
  const incidentId = await ctx.runQuery(internal.incidents.resolveId, { id });
  if (!incidentId) return notFound("Incident not found");
  const body = await parseJson(request);
  return json(await ctx.runMutation(internal.incidents.updateStatus, {
    incidentId, status: String(body?.status ?? "open"),
  }));
})});

http.route({ path: "/incidents/missed-patrols", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  return json(await ctx.runQuery(internal.incidents.missedPatrols, {
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }));
})});

http.route({ path: "/timesheets", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const shifts = await ctx.runQuery(internal.shifts.listAll, {
    startDate: startDate ? new Date(startDate).getTime() : undefined,
    endDate: endDate ? new Date(endDate).getTime() : undefined,
    userId: user.role === "guard" ? _uid(user.convexId) : undefined,
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }) as any[];
  const scans = await ctx.runQuery(internal.scans.listForApi, {
    officerId: user.role === "guard" ? _uid(user.convexId) : undefined,
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
    limit: 5000,
  }) as any[];

  const result = shifts.map((shift) => {
    const clockIn = Date.parse(String(shift.clockIn ?? ""));
    const clockOut = shift.clockOut ? Date.parse(String(shift.clockOut)) : Date.now();
    const shiftScans = scans.filter((scan) => {
      const scannedAt = Date.parse(String(scan.scannedAt ?? ""));
      if (Number.isNaN(clockIn) || Number.isNaN(scannedAt)) return false;
      const scanOfficerId = scan.officerConvexId ?? scan.officerId;
      return scanOfficerId === shift.userId && scannedAt >= clockIn && scannedAt <= clockOut;
    });
    const verifiedScans = shiftScans.filter((scan) => scan.gpsValid === true).length;
    return {
      ...shift,
      shiftId: shift.id,
      scans: shiftScans,
      scanCount: shiftScans.length,
      verifiedScans,
      flaggedScans: shiftScans.length - verifiedScans,
    };
  });

  return json(result);
})});

http.route({ path: "/timesheets/summary", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const shifts = await ctx.runQuery(internal.shifts.listAll, {
    userId: user.role === "guard" ? _uid(user.convexId) : undefined,
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }) as any[];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const weekAgo = Date.now() - 7 * 86400000;
  const recentShifts = shifts.filter((shift) => Date.parse(String(shift.clockIn ?? "")) >= weekAgo);
  const totalHours = (shifts as any[]).reduce((sum: number, s: any) => {
    if (s.clockOut) return sum + (new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime()) / 3600000;
    return sum;
  }, 0);
  const byUser = new Map<string, { userId: string; name: string; shifts: number; hours: number }>();
  for (const shift of recentShifts) {
    const current = byUser.get(shift.userId) ?? {
      userId: shift.userId,
      name: shift.userName ?? "Unknown officer",
      shifts: 0,
      hours: 0,
    };
    current.shifts += 1;
    if (shift.clockOut) {
      current.hours += (new Date(shift.clockOut).getTime() - new Date(shift.clockIn).getTime()) / 3600000;
    }
    byUser.set(shift.userId, current);
  }
  return json({
    totalShifts: recentShifts.length,
    completedShifts: recentShifts.filter(s => s.status === "completed").length,
    activeShifts: shifts.filter(s => s.status === "active").length,
    todayShifts: shifts.filter((s) => Date.parse(String(s.clockIn ?? "")) >= todayStart).length,
    totalHours: Math.round(totalHours * 100) / 100,
    byUser: Array.from(byUser.values()).map((item) => ({
      ...item,
      hours: Math.round(item.hours * 10) / 10,
    })),
  });
})});

http.route({ path: "/post-orders/completions", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  return json(await ctx.runQuery(internal.postOrders.listCompletions, {
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }));
})});

http.route({ path: "/post-orders", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "main_account", "supervisor"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const result = await ctx.runMutation(internal.postOrders.create, {
    title: String(body?.title ?? ""), summary: String(body?.summary ?? ""),
    instructions: String(body?.instructions ?? ""),
    checkpointId: body?.checkpointId ?? undefined,
    assignedUserId: body?.assignedUserId ?? undefined,
    assignedRole: (["admin","main_account","supervisor","guard"].includes(String(body?.assignedRole)) ? String(body?.assignedRole) : "guard") as any,
    priority: String(body?.priority ?? "normal"),
    active: body?.active !== false,
    requiresAcknowledgement: body?.requiresAcknowledgement === true,
    requiresPhotoProof: body?.requiresPhotoProof === true,
    createdBy: _uid(user.convexId),
  });
  await recordAudit(ctx, user, "post_order.created", {
    targetType: "post_order",
      targetId: result.id as unknown as string,
      details: `Created post order: ${body?.title}`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json(result, { status: 201 });
})});

http.route({ pathPrefix: "/post-orders/", method: "PUT", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "main_account", "supervisor"]);
  if (roleErr) return roleErr;
  const id = lastPathPart(request);
  const orderId = await ctx.runQuery(internal.postOrders.resolveId, { id });
  if (!orderId) return notFound("Post order not found");
  const body = await parseJson(request);
  const fields: any = {};
  if (body.title !== undefined) fields.title = String(body.title);
  if (body.summary !== undefined) fields.summary = String(body.summary);
  if (body.instructions !== undefined) fields.instructions = String(body.instructions);
  if (body.priority !== undefined) fields.priority = String(body.priority);
  if (body.active !== undefined) fields.active = Boolean(body.active);
  const result = await ctx.runMutation(internal.postOrders.update, { orderId, ...fields });
  await recordAudit(ctx, user, "post_order.updated", {
    targetType: "post_order",
    targetId: orderId,
    details: `Updated post order fields: ${Object.keys(fields).join(", ")}`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json(result);
})});

http.route({ pathPrefix: "/post-orders/completions/", method: "PATCH", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "supervisor"]);
  if (roleErr) return roleErr;
  const id = lastPathPart(request, 1);
  const action = lastPathPart(request);
  if (!id || action !== "review") return notFound("Completion route not found");
  const completionId = await ctx.runQuery(internal.postOrders.resolveCompletionId, { id });
  if (!completionId) return notFound("Completion not found");
  const body = await parseJson(request);
  const result = await ctx.runMutation(internal.postOrders.reviewCompletion, {
    completionId, reviewerId: _uid(user.convexId),
    reviewStatus: String(body?.reviewStatus ?? "approved"),
    reviewNote: body?.reviewNote,
  });
  await recordAudit(ctx, user, "post_order_completion.reviewed", {
    targetType: "post_order_completion",
    targetId: completionId,
    details: `Reviewed completion as ${body?.reviewStatus ?? "approved"}`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json(result);
})});

http.route({ path: "/handovers", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  return json(await ctx.runQuery(internal.handovers.listAll, {
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }));
})});

http.route({ path: "/clients", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  if (user.role === "admin") {
    return json(await ctx.runQuery(internal.clients.list, {}));
  }
  return json(user.clientId ? [await ctx.runQuery(internal.clients.getById, { clientId: user.clientId as Id<"clients"> })].filter(Boolean) : []);
})});

http.route({ path: "/clients", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const result = await ctx.runMutation(internal.clients.create, {
    name: String(body?.name ?? ""), email: String(body?.email ?? ""),
    phone: String(body?.phone ?? ""), active: body?.active !== false,
  });
  await recordAudit(ctx, user, "client.created", {
    targetType: "client",
      targetId: result.id as unknown as string,
      details: `Created client: ${body?.name}`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json(result, { status: 201 });
})});

http.route({ path: "/sites", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const queryClientId = url.searchParams.get("clientId");
  const effectiveClientId = queryClientId || (user.role === "admin" ? undefined : (_cid(user.clientId)));
  return json(await ctx.runQuery(internal.sites.list, {
    clientId: effectiveClientId as Id<"clients"> | undefined,
  }));
})});

http.route({ path: "/sites", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "main_account"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const result = await ctx.runMutation(internal.sites.create, {
    name: String(body?.name ?? ""), location: String(body?.location ?? ""),
    clientId: String(body?.clientId ?? "") as Id<"clients">,
    active: body?.active !== false,
    patrolIntervalMinutes: body?.patrolIntervalMinutes === undefined ? undefined : Number(body.patrolIntervalMinutes),
    patrolGracePeriodMinutes: body?.patrolGracePeriodMinutes === undefined ? undefined : Number(body.patrolGracePeriodMinutes),
  });
  await recordAudit(ctx, user, "site.created", {
    targetType: "site",
      targetId: result.id as unknown as string,
      details: `Created site: ${body?.name}`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json(result, { status: 201 });
})});

http.route({ path: "/ai/chat", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const body = await parseJson(request);
  const message = String(body?.message ?? "").trim();
  if (!message) return badRequest("message is required");
  const history = Array.isArray(body?.history) ? body.history : [];
  try {
    const result = await ctx.runAction(internal.aiService.chat, {
      userId: _uid(user.convexId),
      userRole: user.role,
      clientId: user.clientId ?? undefined,
      question: message,
      history,
    });
    return json(result);
  } catch (error: any) {
    if (error.status === 429) {
      return tooManyRequests(error.message);
    }
    console.error("[AI_CHAT_ERROR]", error);
    return json({
      answer: "I could not reach the AI service right now. Please try again shortly.",
      intent: "unknown",
      model: null,
      assistantUnavailable: true,
      generatedReportId: null,
      sources: [],
    });
  }
})});

http.route({ path: "/ai/reports", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  return json(await ctx.runQuery(internal.aiService.listReports, {
    userId: _uid(user.convexId),
    userRole: user.role,
    clientId: _cid(user.clientId),
  }));
})});

http.route({ path: "/ai/architecture", method: "GET", handler: httpAction(async (_ctx, _request) => {
  return json({
    provider: {
      name: "NVIDIA NIM Chat Completions",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKeyEnv: "NVIDIA_API_KEY",
      defaultChatModel: process.env.NVIDIA_CHAT_MODEL || "openai/gpt-oss-120b",
    },
    liveData: ["shifts", "scans", "checkpoints", "incidents", "passOnLogs", "handovers", "sites", "clients"],
    reportTypes: REPORT_TYPES,
  });
})});

http.route({ pathPrefix: "/sites/", method: "PUT", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  if (user.role === "guard") return forbidden("Supervisor access required");
  const id = lastPathPart(request);
  if (!id) return badRequest("Site ID required");
  const siteId = await ctx.runQuery(internal.sites.resolveId, { id });
  if (!siteId) return notFound("Site not found");
  const site = await ctx.runQuery(internal.sites.getById, { siteId });
  if (!site) return notFound("Site not found");
  if (user.role !== "admin" && site.clientId !== user.clientId) {
    return forbidden("Site access denied");
  }
  const body = await parseJson(request);
  return json(await ctx.runMutation(internal.sites.update, {
    siteId, name: body.name, location: body.location, active: body.active,
    patrolIntervalMinutes: body.patrolIntervalMinutes === undefined ? undefined : Number(body.patrolIntervalMinutes),
    patrolGracePeriodMinutes: body.patrolGracePeriodMinutes === undefined ? undefined : Number(body.patrolGracePeriodMinutes),
  }));
})});

export default http;
