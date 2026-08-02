import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { json, methodNotAllowed, parseJson } from "./lib/http";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import bcrypt from "bcryptjs";
import { signPatrolToken } from "./lib/jwt";
import { requireAuth } from "./lib/httpAuth";
import type { SensitiveAction } from "./audit";
import { badRequest, conflict, errorResponse, forbidden, notFound, serviceUnavailable, tooManyRequests, unauthorized } from "./lib/errors";
import {
  resolveFileRef,
  resolvePhotoRef,
  resolvePhotoRefs,
  verifyPhotoToken,
} from "./lib/photoRefs";
import { getApiBaseUrl } from "./env";

const _uid = (s: string): Id<"users"> => s as Id<"users">;
const _cid = (s: string | null | undefined): Id<"clients"> | undefined => (s ?? undefined) as Id<"clients"> | undefined;
const _sid = (s: string | null | undefined): Id<"sites"> | undefined => (s ?? undefined) as Id<"sites"> | undefined;
const _cpid = (s: string | null | undefined): Id<"checkpoints"> | undefined => (s ?? undefined) as Id<"checkpoints"> | undefined;
const _sidRequired = (s: string): Id<"sites"> => s as Id<"sites">;
const internalAny = internal as any;

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

// Stored files are only reachable through the authorized /photos route, never
// directly. What matters here is refusing to keep anything that is not actually
// an image of a sane size — a client can upload arbitrary bytes straight to
// storage, so this check is the only thing standing behind that door.

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const IMAGE_HEADER_BYTES = 12;

async function validateImageBlob(blob: Blob): Promise<Response | null> {
  if (blob.size > MAX_IMAGE_SIZE) {
    return badRequest(`File size ${blob.size} exceeds the 5MB limit`);
  }
  if (!ALLOWED_IMAGE_TYPES.includes(blob.type)) {
    return badRequest(
      `Unsupported file type: ${blob.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
    );
  }
  // Anything shorter than the longest magic number we test cannot be a valid
  // image, and would make the byte comparisons below read past the end.
  if (blob.size < IMAGE_HEADER_BYTES) {
    return badRequest("File is too small to be a valid image");
  }
  // Read the whole buffer rather than blob.slice(): blobs handed back by
  // Convex storage throw "offset is out of bounds" on a sliced arrayBuffer(),
  // which the old base64 path never hit because it built its blobs in-process.
  const header = new Uint8Array(await blob.arrayBuffer()).subarray(
    0,
    IMAGE_HEADER_BYTES,
  );
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

const PHOTO_KINDS = [
  "clock_in",
  "clock_out",
  "incident",
  "maintenance",
  "post_order_proof",
  "handover",
] as const;
type PhotoKind = (typeof PHOTO_KINDS)[number];

/**
 * Inspects a blob that a client uploaded straight to storage and records it.
 *
 * With direct uploads the bytes arrive before we ever see them, so validation
 * moves from "reject at the door" to "inspect and destroy": anything that is
 * not a real image of a sane size is deleted from storage immediately rather
 * than being left to linger, and the caller gets the same 400 as before.
 */
async function claimUploadedPhoto(
  ctx: any,
  user: { convexId: string },
  rawStorageId: unknown,
  kind: PhotoKind,
): Promise<{ storageId: string } | Response> {
  if (typeof rawStorageId !== "string" || !rawStorageId.trim()) {
    return badRequest("storageId is required");
  }
  const storageId = rawStorageId.trim() as Id<"_storage">;

  const blob = await ctx.storage.get(storageId);
  if (!blob) return badRequest("Upload not found — request a new upload URL");

  const invalid = await validateImageBlob(blob);
  if (invalid) {
    await ctx.storage.delete(storageId);
    return invalid;
  }

  try {
    await ctx.runMutation(internal.photos.claimAsset, {
      storageId,
      uploadedBy: _uid(user.convexId),
      kind,
      contentType: blob.type,
      sizeBytes: blob.size,
    });
  } catch (err) {
    // Someone else's upload: leave their blob alone, refuse the claim.
    if (err instanceof Error && err.message.includes("another user")) {
      return forbidden("Upload belongs to another user");
    }
    throw err;
  }
  return { storageId };
}

/**
 * Binds already-claimed photos to the record that now references them. Called
 * after the record exists so the sweeper stops treating them as abandoned.
 */
async function attachPhotos(
  ctx: any,
  user: { convexId: string },
  storageIds: readonly string[],
  table: string,
  recordId: string,
) {
  for (const storageId of storageIds) {
    await ctx.runMutation(internal.photos.attachAsset, {
      storageId: storageId as Id<"_storage">,
      userId: _uid(user.convexId),
      table,
      recordId,
    });
  }
}

/** Viewer shape the photo-ref resolver needs. */
function photoViewer(user: {
  role: string;
  clientId?: string | null;
  convexId?: string;
}) {
  return {
    role: user.role,
    clientId: user.clientId ?? null,
    userId: user.convexId ?? null,
  };
}

// Columns that hold a photo ref. Kept as data rather than resolved by hand at
// each call site: there are a dozen routes returning these shapes, and a route
// that quietly forgets to resolve is a broken image, while a route that forgets
// to *stop* emitting a raw ref is a leak. One list, one place to audit.
const PHOTO_REF_FIELDS = new Set([
  "clockInPhoto",
  "clockOutPhoto",
  "proofPhotoUrl",
  "photoUrl",
]);
const PHOTO_REF_ARRAY_FIELDS = new Set(["photoUrls", "evidenceUrls"]);

/**
 * Walks a response payload and swaps every stored photo ref for a short-lived
 * signed URL the viewer is allowed to load. Legacy permanent URLs pass through
 * untouched so unmigrated rows keep rendering.
 */
async function withSignedPhotos<T>(
  user: { role: string; clientId?: string | null },
  payload: T,
): Promise<T> {
  const viewer = photoViewer(user);
  const apiBaseUrl = getApiBaseUrl();

  const walk = async (node: any): Promise<any> => {
    if (Array.isArray(node)) return await Promise.all(node.map(walk));
    if (!node || typeof node !== "object") return node;

    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string" && PHOTO_REF_FIELDS.has(key)) {
        out[key] = await resolvePhotoRef(value, viewer, apiBaseUrl);
      } else if (Array.isArray(value) && PHOTO_REF_ARRAY_FIELDS.has(key)) {
        out[key] = await resolvePhotoRefs(value as string[], viewer, apiBaseUrl);
      } else {
        out[key] = await walk(value);
      }
    }
    return out;
  };

  return (await walk(payload)) as T;
}

/** json(), with every photo ref in the payload resolved for this viewer. */
async function jsonWithPhotos(
  user: { role: string; clientId?: string | null; convexId?: string },
  payload: unknown,
  init?: ResponseInit,
) {
  return json(await withSignedPhotos(user, payload), init);
}

/**
 * json(), with export downloadUrl refs resolved into signed, expiring links.
 * Separate from the photo walker because downloadUrl is a file, not an image,
 * and is served by /files rather than /photos.
 */
async function withSignedFiles<T>(
  user: { role: string; clientId?: string | null; convexId?: string },
  payload: T,
): Promise<T> {
  const viewer = photoViewer(user);
  const apiBaseUrl = getApiBaseUrl();
  const walk = async (node: any): Promise<any> => {
    if (Array.isArray(node)) return await Promise.all(node.map(walk));
    if (!node || typeof node !== "object") return node;
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "downloadUrl" && typeof value === "string") {
        out[key] = (await resolveFileRef(value, viewer, apiBaseUrl)) ?? "";
      } else {
        out[key] = await walk(value);
      }
    }
    return out;
  };
  return (await walk(payload)) as T;
}

async function jsonWithFile(
  user: { role: string; clientId?: string | null; convexId?: string },
  payload: unknown,
  init?: ResponseInit,
) {
  return json(await withSignedFiles(user, payload), init);
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

function inferAiIntent(question: string) {
  const q = question.toLowerCase();
  if (/\b(how many|number of|count|total)\b.*\b(location|locations|checkpoint|checkpoints|site|sites)\b|\b(location|locations|checkpoint|checkpoints|site|sites)\b.*\b(how many|number|count|total)\b/.test(q)) return "location_count";
  if (/\b(phone|email|contact|details|profile)\b/.test(q)) return "guard_details";
  if (/\b(last|latest|recent)\b.*\b(scan|patrol|checkpoint)\b|\b(scan|patrol|checkpoint)\b.*\b(today)\b/.test(q)) return "last_scan";
  if (/\b(pass.?on|handover|handoff)\b/.test(q)) return "pass_on_logs";
  if (/\b(on duty|active guard|active guards|currently active|clocked in|clock-in|who is currently|who's currently)\b/.test(q)) {
    return "on_duty";
  }
  if (/\b(report|summary|daily|weekly|monthly|client update|email)\b/.test(q)) return "report";
  if (/\b(policy|sop|procedure|training|post order|instruction)\b/.test(q)) return "knowledge";
  if (/\b(scan|patrol|checkpoint|missed)\b/.test(q)) return "patrol";
  if (/\b(geofence|gps|location|radius|outside)\b/.test(q)) return "geofence";
  if (/\b(pass.?on|handover|handoff)\b/.test(q)) return "handover";
  if (/\b(alert|risk|emergency|inactivity|suspicious)\b/.test(q)) return "risk";
  return "operations";
}

function formatAiTime(value: string | null) {
  if (!value) return "time not recorded";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildOnDutyAnswer(snapshot: any) {
  const counts = snapshot.counts ?? {};
  const activeGuards = Array.isArray(snapshot.activeGuards) ? snapshot.activeGuards : [];
  const missingData = snapshot.dataValidation?.missingData ?? [];
  const registered = counts.totalGuardsRegistered ?? 0;
  const onDuty = counts.guardsCurrentlyOnDuty ?? 0;
  const assigned = counts.guardsAssignedToSites ?? 0;
  const scannedToday = counts.guardsWithPatrolScansToday ?? 0;

  const lines = [
    `There are ${registered} guards registered in the system, ${assigned} assigned to at least one site, and ${onDuty} currently active/on duty.`,
    `${scannedToday} guard${scannedToday === 1 ? " has" : "s have"} patrol scans recorded today.`,
  ];

  if (activeGuards.length > 0) {
    lines.push("");
    lines.push("Currently on duty:");
    for (const guard of activeGuards) {
      const shift = guard.currentShift;
      const lastActivity = guard.lastActivity;
      lines.push(
        `- ${guard.name} — ${shift?.siteName ?? "site not resolved"}; clocked in ${formatAiTime(shift?.clockIn ?? null)}; status: ${shift?.status ?? "active"}; last activity: ${
          lastActivity?.type === "patrol_scan"
            ? `patrol scan at ${formatAiTime(lastActivity.at)}${lastActivity.gpsValid === false ? " (GPS flagged)" : ""}`
            : `clock-in at ${formatAiTime(lastActivity?.at ?? shift?.clockIn ?? null)}`
        }.`,
      );
    }
  } else {
    lines.push("");
    lines.push("I checked guard profiles, active shift records, site assignments, and today's patrol scans. I did not find any guard with an active shift in the current access scope.");
  }

  if (missingData.length > 0) {
    lines.push("");
    lines.push(`Data note: ${missingData.join(" ")}`);
  }

  return lines.join("\n");
}

function buildGuardDetailsAnswer(snapshot: any, question: string) {
  const q = question.toLowerCase();
  const guards = Array.isArray(snapshot.guards) ? snapshot.guards : [];
  const activeGuards = Array.isArray(snapshot.activeGuards) ? snapshot.activeGuards : [];
  const matched =
    guards.find((guard: any) => q.includes(String(guard.name ?? "").toLowerCase())) ??
    (activeGuards.length === 1 ? activeGuards[0] : null);

  if (!matched) {
    return "I could not identify which guard you mean from the verified records. Please give me the guard name.";
  }

  const shift = matched.currentShift;
  const assignedSites = Array.isArray(matched.assignedSites) && matched.assignedSites.length
    ? matched.assignedSites.map((site: any) => site.name).join(", ")
    : "No resolved site assignment";

  return [
    `${matched.name}`,
    `Phone: ${matched.phone || "not recorded"}`,
    `Email: ${matched.email || "not recorded"}`,
    `Current status: ${matched.currentlyOnDuty ? "active/on duty" : matched.activeProfile ? "active profile, not on duty" : "inactive profile"}`,
    `Assigned site: ${shift?.siteName || assignedSites}`,
    `Clock-in: ${shift?.clockIn ? formatAiTime(shift.clockIn) : "not currently clocked in"}`,
  ].join("\n");
}

function buildLastScanAnswer(snapshot: any) {
  const scans = Array.isArray(snapshot.recentScans) ? snapshot.recentScans : [];
  const today = new Date().toISOString().slice(0, 10);
  const todayScans = scans.filter((scan: any) => String(scan.scannedAt ?? "").startsWith(today));
  const latest = todayScans[0];
  if (!latest) {
    return "No patrol scans are recorded for today in the verified scan table.";
  }
  return [
    `Latest scan today: ${latest.officerName || "Unknown officer"} at ${formatAiTime(latest.scannedAt)}.`,
    `Site: ${latest.siteName || "site not resolved"}.`,
    `GPS: ${latest.gpsValid ? "verified" : "flagged"}${latest.distanceMeters != null ? `, ${latest.distanceMeters}m from checkpoint` : ""}.`,
  ].join("\n");
}

function buildPassOnLogsAnswer(snapshot: any) {
  const logs = Array.isArray(snapshot.passOnLogs) ? snapshot.passOnLogs : [];
  if (!logs.length) {
    return "No active pass-on logs are recorded in the verified pass-on log table.";
  }
  const lines = [`There are ${logs.length} active pass-on log${logs.length === 1 ? "" : "s"}.`];
  for (const log of logs.slice(0, 5)) {
    lines.push(`- ${log.title}: ${log.instruction}${log.siteLabel ? ` (${log.siteLabel})` : ""}`);
  }
  return lines.join("\n");
}

function buildLocationCountAnswer(snapshot: any) {
  const counts = snapshot.counts ?? {};
  const sites = Array.isArray(snapshot.sites) ? snapshot.sites : [];
  const checkpoints = Array.isArray(snapshot.checkpoints) ? snapshot.checkpoints : [];
  const lines = [
    `There are ${counts.totalCheckpoints ?? checkpoints.length} checkpoints in the system right now.`,
    `${counts.activeCheckpoints ?? checkpoints.filter((checkpoint: any) => checkpoint.active).length} are active and ${counts.inactiveCheckpoints ?? checkpoints.filter((checkpoint: any) => !checkpoint.active).length} are inactive.`,
    `There are ${counts.scopedSites ?? sites.length} locations/sites in scope.`,
  ];
  if (checkpoints.length) {
    lines.push(`Checkpoints: ${checkpoints.slice(0, 8).map((checkpoint: any) => checkpoint.siteName ? `${checkpoint.name} (${checkpoint.siteName})` : checkpoint.name).join(", ")}${checkpoints.length > 8 ? ", ..." : ""}`);
  }
  return lines.join("\n");
}

function findReportFocus(snapshot: any, question: string) {
  const q = question.toLowerCase();
  const guards = Array.isArray(snapshot.guards) ? snapshot.guards : [];
  const sites = Array.isArray(snapshot.sites) ? snapshot.sites : [];
  const matchedGuard = guards.find((guard: any) => q.includes(String(guard.name ?? "").toLowerCase()));
  const matchedSite =
    (Array.isArray(snapshot.questionMatches?.sites) ? snapshot.questionMatches.sites[0] : null) ??
    sites.find((site: any) => q.includes(String(site.name ?? "").toLowerCase()));
  return { matchedGuard, matchedSite };
}

function buildOperationalReport(snapshot: any, question: string) {
  const { matchedGuard, matchedSite } = findReportFocus(snapshot, question);
  const counts = snapshot.counts ?? {};
  const reportSubject = matchedGuard?.name ?? matchedSite?.name ?? "Operational Activity";
  const generatedAt = new Date(snapshot.checkedAt ?? Date.now()).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const relatedScans = (snapshot.recentScans ?? []).filter((scan: any) => {
    if (matchedGuard && scan.officerName !== matchedGuard.name) return false;
    if (matchedSite && scan.siteId !== matchedSite.convexId && scan.siteName !== matchedSite.name) return false;
    return true;
  });
  const relatedShifts = (snapshot.recentShifts ?? []).filter((shift: any) => {
    if (matchedGuard && shift.guardName !== matchedGuard.name) return false;
    if (matchedSite && shift.siteId !== matchedSite.convexId && shift.siteName !== matchedSite.name) return false;
    return true;
  });
  const relatedIncidents = (snapshot.incidents ?? []).filter((incident: any) => {
    if (!matchedSite) return true;
    return incident.siteId === matchedSite.convexId;
  });
  const relatedPassOnLogs = (snapshot.passOnLogs ?? []).filter((log: any) => {
    if (!matchedSite) return true;
    return log.siteId === matchedSite.convexId || String(log.siteLabel ?? "").toLowerCase().includes(String(matchedSite.name ?? "").toLowerCase());
  });

  const lines = [
    `Operational Report: ${reportSubject}`,
    `Generated: ${generatedAt}`,
    "",
    "Summary",
    `This report was prepared from verified live system records for ${reportSubject}.`,
    `Registered guards in scope: ${counts.totalGuardsRegistered ?? 0}. Currently on duty: ${counts.guardsCurrentlyOnDuty ?? 0}. Patrol scans today: ${counts.patrolScansToday ?? 0}.`,
    "",
    "Subject Details",
  ];

  if (matchedGuard) {
    const shift = matchedGuard.currentShift;
    const sites = matchedGuard.assignedSites?.length
      ? matchedGuard.assignedSites.map((site: any) => site.name).join(", ")
      : "No resolved site assignment";
    lines.push(`Guard: ${matchedGuard.name}`);
    lines.push(`Status: ${matchedGuard.currentlyOnDuty ? "Active/on duty" : matchedGuard.activeProfile ? "Active profile, not on duty" : "Inactive profile"}`);
    lines.push(`Assigned site: ${shift?.siteName || sites}`);
    lines.push(`Clock-in: ${shift?.clockIn ? formatAiTime(shift.clockIn) : "Not currently clocked in"}`);
  } else if (matchedSite) {
    lines.push(`Site: ${matchedSite.name}`);
    lines.push(`Location: ${matchedSite.location || "No location text recorded"}`);
    lines.push(`Site status: ${matchedSite.active ? "Active" : "Inactive"}`);
  } else {
    lines.push("No specific guard or site was confidently matched from the request.");
  }

  lines.push("");
  lines.push("Recent Shift Activity");
  if (relatedShifts.length) {
    for (const shift of relatedShifts.slice(0, 10)) {
      lines.push(`- ${shift.guardName || "Unknown guard"} at ${shift.siteName || "site not resolved"}: ${shift.status}, clock-in ${formatAiTime(shift.clockIn)}, clock-out ${shift.clockOut ? formatAiTime(shift.clockOut) : "not recorded"}.`);
    }
  } else {
    lines.push("- No matching shift records found in the verified snapshot.");
  }

  lines.push("");
  lines.push("Patrol Scan Activity");
  if (relatedScans.length) {
    for (const scan of relatedScans.slice(0, 12)) {
      lines.push(`- ${formatAiTime(scan.scannedAt)}: ${scan.officerName || "Unknown officer"} scanned ${scan.siteName || "site not resolved"}; GPS ${scan.gpsValid ? "verified" : "flagged"}${scan.distanceMeters != null ? ` (${scan.distanceMeters}m)` : ""}.`);
    }
  } else {
    lines.push("- No matching patrol scans found in the verified snapshot.");
  }

  lines.push("");
  lines.push("Incidents and Pass-On Notes");
  if (relatedIncidents.length) {
    for (const incident of relatedIncidents.slice(0, 5)) {
      lines.push(`- Incident: ${incident.title} (${incident.severity}, ${incident.status}) reported ${formatAiTime(incident.reportedAt)}.`);
    }
  } else {
    lines.push("- No matching open incidents found.");
  }
  if (relatedPassOnLogs.length) {
    for (const log of relatedPassOnLogs.slice(0, 5)) {
      lines.push(`- Pass-on: ${log.title}: ${log.instruction}`);
    }
  } else {
    lines.push("- No matching active pass-on logs found.");
  }

  lines.push("");
  lines.push("Data Notes");
  const missing = snapshot.dataValidation?.missingData ?? [];
  lines.push(missing.length ? missing.join(" ") : "No additional data gaps were flagged in the checked records.");

  return lines.join("\n");
}

async function callNvidiaChat(messages: Array<{ role: string; content: string }>) {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) {
    return {
      unavailable: true,
      content: "The AI assistant is not available because NVIDIA_API_KEY is not configured on the Convex dev backend.",
      model: process.env.NVIDIA_CHAT_MODEL || "openai/gpt-oss-120b",
    };
  }

  const baseUrl = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  const model = process.env.NVIDIA_CHAT_MODEL || "openai/gpt-oss-120b";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 1,
      top_p: 1,
      max_tokens: 4096,
      stream: false,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`NVIDIA chat API error ${response.status}${details ? `: ${details.slice(0, 240)}` : ""}`);
  }

  const data = await response.json();
  return {
    unavailable: false,
    content: data?.choices?.[0]?.message?.content ?? "",
    model: data?.model ?? model,
  };
}

// Access tokens are 30-minute JWTs; long-lived sessions ride on the rotating
// refresh tokens below. The raw refresh token only ever exists in the HTTP
// response — the database sees just its SHA-256 hash.
const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;

function generateRefreshToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashRefreshToken(raw: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// Streams a cached PDF out of Convex storage as a download.
async function servePdf(
  ctx: { storage: { get: (id: Id<"_storage">) => Promise<Blob | null> } },
  storageId: string | null,
  filename: string,
) {
  if (!storageId) return notFound("Report not found");
  const blob = await ctx.storage.get(storageId as Id<"_storage">);
  if (!blob) return notFound("PDF not found");
  return new Response(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}

// Request protection gate. Runs global load shedding + the per-actor rate limit
// for `action`, keyed by `actorId` (a user id for authed routes, or the client
// IP / email for pre-auth routes like login). Returns a ready-to-send 503/429
// Response when the request must be rejected, or null when it may proceed.
//
// `skipGlobal` exempts a route from global shedding (its per-actor limit still
// applies) — used for safety-critical endpoints like emergency triggers that
// must go through even when the system is shedding other load.
async function enforceLimit(
  ctx: any,
  action: string,
  actorId: string | undefined,
  opts?: { skipGlobal?: boolean },
): Promise<Response | null> {
  // No stable actor key (e.g. missing IP on a pre-auth request) — fall back to
  // a shared bucket so the endpoint still can't be flooded anonymously.
  const key = actorId && actorId.length > 0 ? actorId : "anonymous";
  let result;
  try {
    result = await ctx.runMutation(internal.lib.rateLimiter.guard, {
      action,
      actorId: key,
      skipGlobal: opts?.skipGlobal,
    });
  } catch (err) {
    // FAIL OPEN. The limiter's counter is a single row per (actor, action,
    // window); a burst of truly-simultaneous writes from one actor can lose the
    // optimistic-concurrency retry race and throw. The rate limiter must never
    // be the thing that takes a request down — admit it rather than 500. Worst
    // case a few extra requests slip through under contention, which is exactly
    // the regime where a per-actor cap matters least anyway.
    console.error(`rate limiter failed open for action=${action}:`, err);
    return null;
  }
  if (result.allowed) return null;
  return result.scope === "global"
    ? serviceUnavailable(result.reason, result.retryAfterMs)
    : tooManyRequests(result.reason, result.retryAfterMs);
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
  path: "/ai/chat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();

    const body = await parseJson(request);
    const question = String(body?.message ?? "").trim();
    if (!question) return badRequest("message is required");

    const intent = inferAiIntent(question);
    const rate = await ctx.runMutation(internalAny.ai.checkAndIncrementRateLimit, {
      userId: _uid(user.convexId),
      perMinute: Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 8),
      perDay: Number(process.env.AI_RATE_LIMIT_PER_DAY ?? 120),
    }) as { allowed: boolean; reason: string };
    if (!rate.allowed) return tooManyRequests(rate.reason);

    const snapshot = await ctx.runQuery(internalAny.ai.getOperationalSnapshot, {
      requester: {
        userId: _uid(user.convexId),
        role: user.role,
        clientId: _cid(user.clientId),
        siteIds: (user.siteIds ?? []).map((siteId) => _sid(siteId)),
      },
      question,
    });

    const dataSources = [
      "users",
      "shifts",
      "userSiteAssignments",
      "sites",
      "checkpoints",
      "scans",
      "incidents",
      "passOnLogs",
      "handovers",
    ];
    const sensitive = /\b(phone|email|contact|number|address)\b/i.test(question);

    try {
      let answer = "";
      let model: string | null = null;
      let assistantUnavailable = false;
      let generatedReportId: string | null = null;

      if (intent === "on_duty") {
        answer = buildOnDutyAnswer(snapshot);
      } else if (intent === "guard_details") {
        answer = buildGuardDetailsAnswer(snapshot, question);
      } else if (intent === "last_scan") {
        answer = buildLastScanAnswer(snapshot);
      } else if (intent === "pass_on_logs") {
        answer = buildPassOnLogsAnswer(snapshot);
      } else if (intent === "location_count") {
        answer = buildLocationCountAnswer(snapshot);
      } else if (intent === "report") {
        answer = buildOperationalReport(snapshot, question);
      } else {
        const result = await callNvidiaChat([
          {
            role: "system",
            content:
              "You are the AI Operations Assistant for Evergreen / Patrol Security. Answer like a professional control-room assistant. Only use the verified JSON data provided. Never invent guard counts, active shifts, clock-in times, sites, checkpoints, patrol scans, incidents, pass-on logs, or locations. Use questionMatches.sites and questionMatches.checkpoints for fuzzy location matches when the user misspells a site/checkpoint. If data is missing, say exactly what is missing. Keep answers short: 2 to 6 plain lines. Do not use markdown tables, ### headings, **bold**, or long report formatting unless the user explicitly asks for a report.",
          },
          {
            role: "user",
            content: JSON.stringify({
              question,
              intent,
              verifiedOperationalSnapshot: snapshot,
            }),
          },
        ]);
        assistantUnavailable = !!result.unavailable;
        model = result.model ?? null;
        answer = result.content || "I checked the live operational records, but the AI provider did not return a usable answer.";
      }

      if (intent === "report" && answer && !assistantUnavailable) {
        generatedReportId = await ctx.runMutation(internalAny.ai.saveGeneratedReport, {
          userId: _uid(user.convexId),
          reportType: "Operational Report",
          title: `AI Operational Report - ${new Date().toLocaleDateString()}`,
          content: answer,
          sourceSummary: {
            checkedAt: (snapshot as any).checkedAt,
            counts: (snapshot as any).counts,
            sources: dataSources,
          },
        }) as string;
      }

      await ctx.runMutation(internalAny.ai.recordAudit, {
        userId: _uid(user.convexId),
        userRole: user.role,
        question,
        intent,
        dataSources,
        sensitive,
        status: "completed",
      });

      return json({
        answer,
        intent,
        model,
        assistantUnavailable,
        generatedReportId,
        sources: dataSources,
        validation: (snapshot as any).dataValidation,
        counts: (snapshot as any).counts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI error";
      await ctx.runMutation(internalAny.ai.recordAudit, {
        userId: _uid(user.convexId),
        userRole: user.role,
        question,
        intent,
        dataSources,
        sensitive,
        status: "failed",
        error: message,
      });
      return json({
        answer: buildOnDutyAnswer(snapshot),
        intent,
        model: null,
        assistantUnavailable: true,
        generatedReportId: null,
        sources: dataSources,
        validation: (snapshot as any).dataValidation,
        counts: (snapshot as any).counts,
      });
    }
  }),
});

http.route({
  path: "/ai/reports",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internalAny.ai.listGeneratedReports, {
      requester: {
        userId: _uid(user.convexId),
        role: user.role,
        clientId: _cid(user.clientId),
        siteIds: (user.siteIds ?? []).map((siteId) => _sid(siteId)),
      },
      limit: 30,
    }));
  }),
});

http.route({
  path: "/api/v1/ai/chat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();

    const body = await parseJson(request);
    const question = String(body?.message ?? "").trim();
    if (!question) return badRequest("message is required");

    const intent = inferAiIntent(question);
    const rate = await ctx.runMutation(internalAny.ai.checkAndIncrementRateLimit, {
      userId: _uid(user.convexId),
      perMinute: Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 8),
      perDay: Number(process.env.AI_RATE_LIMIT_PER_DAY ?? 120),
    }) as { allowed: boolean; reason: string };
    if (!rate.allowed) return tooManyRequests(rate.reason);

    const snapshot = await ctx.runQuery(internalAny.ai.getOperationalSnapshot, {
      requester: {
        userId: _uid(user.convexId),
        role: user.role,
        clientId: _cid(user.clientId),
        siteIds: (user.siteIds ?? []).map((siteId) => _sid(siteId)),
      },
      question,
    });

    const dataSources = ["users", "shifts", "userSiteAssignments", "sites", "checkpoints", "scans", "incidents", "passOnLogs", "handovers"];
    const sensitive = /\b(phone|email|contact|number|address)\b/i.test(question);

    try {
      let answer = "";
      let model: string | null = null;
      let assistantUnavailable = false;
      let generatedReportId: string | null = null;

      if (intent === "on_duty") {
        answer = buildOnDutyAnswer(snapshot);
      } else if (intent === "guard_details") {
        answer = buildGuardDetailsAnswer(snapshot, question);
      } else if (intent === "last_scan") {
        answer = buildLastScanAnswer(snapshot);
      } else if (intent === "pass_on_logs") {
        answer = buildPassOnLogsAnswer(snapshot);
      } else if (intent === "location_count") {
        answer = buildLocationCountAnswer(snapshot);
      } else if (intent === "report") {
        answer = buildOperationalReport(snapshot, question);
      } else {
        const result = await callNvidiaChat([
          {
            role: "system",
            content:
              "You are the AI Operations Assistant for Evergreen / Patrol Security. Answer like a professional control-room assistant. Only use the verified JSON data provided. Never invent guard counts, active shifts, clock-in times, sites, checkpoints, patrol scans, incidents, pass-on logs, or locations. Use questionMatches.sites and questionMatches.checkpoints for fuzzy location matches when the user misspells a site/checkpoint. If data is missing, say exactly what is missing. Keep answers short: 2 to 6 plain lines. Do not use markdown tables, ### headings, **bold**, or long report formatting unless the user explicitly asks for a report.",
          },
          {
            role: "user",
            content: JSON.stringify({ question, intent, verifiedOperationalSnapshot: snapshot }),
          },
        ]);
        assistantUnavailable = !!result.unavailable;
        model = result.model ?? null;
        answer = result.content || "I checked the live operational records, but the AI provider did not return a usable answer.";
      }

      if (intent === "report" && answer && !assistantUnavailable) {
        generatedReportId = await ctx.runMutation(internalAny.ai.saveGeneratedReport, {
          userId: _uid(user.convexId),
          reportType: "Operational Report",
          title: `AI Operational Report - ${new Date().toLocaleDateString()}`,
          content: answer,
          sourceSummary: {
            checkedAt: (snapshot as any).checkedAt,
            counts: (snapshot as any).counts,
            sources: dataSources,
          },
        }) as string;
      }

      await ctx.runMutation(internalAny.ai.recordAudit, {
        userId: _uid(user.convexId),
        userRole: user.role,
        question,
        intent,
        dataSources,
        sensitive,
        status: "completed",
      });

      return json({
        answer,
        intent,
        model,
        assistantUnavailable,
        generatedReportId,
        sources: dataSources,
        validation: (snapshot as any).dataValidation,
        counts: (snapshot as any).counts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI error";
      await ctx.runMutation(internalAny.ai.recordAudit, {
        userId: _uid(user.convexId),
        userRole: user.role,
        question,
        intent,
        dataSources,
        sensitive,
        status: "failed",
        error: message,
      });
      return json({
        answer: buildOnDutyAnswer(snapshot),
        intent,
        model: null,
        assistantUnavailable: true,
        generatedReportId: null,
        sources: dataSources,
        validation: (snapshot as any).dataValidation,
        counts: (snapshot as any).counts,
      });
    }
  }),
});

http.route({
  path: "/api/v1/ai/reports",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    return json(await ctx.runQuery(internalAny.ai.listGeneratedReports, {
      requester: {
        userId: _uid(user.convexId),
        role: user.role,
        clientId: _cid(user.clientId),
        siteIds: (user.siteIds ?? []).map((siteId) => _sid(siteId)),
      },
      limit: 30,
    }));
  }),
});

http.route({
  path: "/dev/seed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // SECURITY: bootstrap-only endpoint. Requires the DEV_SEED_SECRET env var
    // to be set on the deployment AND presented as a Bearer token, and only
    // works while the database has no users at all.
    const seedSecret = process.env.DEV_SEED_SECRET
    if (!seedSecret) {
      return notFound()
    }
    const authHeader = request.headers.get("authorization") ?? ""
    if (authHeader !== `Bearer ${seedSecret}`) {
      return unauthorized("Invalid seed secret")
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
    // SECURITY: requires a real authenticated admin session.
    const user = await requireAuth(ctx, request)
    if (!user) return unauthorized()
    if (user.role !== "admin") {
      return forbidden("Admin access required")
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

    // Rate-limit BEFORE the user lookup so failed attempts against unknown
    // emails are capped too (credential stuffing / enumeration). Keyed by
    // email+IP so one attacker can't burn a victim's whole budget from afar,
    // and one IP can't spray many emails.
    const loginLimited = await enforceLimit(
      ctx,
      "login",
      `${email}|${requestIp(request) ?? "noip"}`,
    );
    if (loginLimited) return loginLimited;

    const user = await ctx.runQuery(internal.users.findByEmail, { email });
    if (!user || !user.active) {
      return unauthorized("Invalid credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return unauthorized("Invalid credentials");
    }
    if (clientType === "mobile" && user.role !== "guard") {
      return forbidden("Mobile access is restricted to guard accounts");
    }
    // The client portal (web-client) is for client (main_account) accounts only.
    if (clientType === "client" && user.role !== "main_account") {
      return forbidden("The client portal is for client accounts only.");
    }
    // The staff web dashboard is for staff only. Client accounts (main_account)
    // now sign in through the separate client portal, not here.
    if (clientType !== "mobile" && clientType !== "client" && user.role === "main_account") {
      return forbidden("Client accounts no longer have access to the staff dashboard. Please use the client portal.");
    }

    const safeUser = await ctx.runQuery(internal.users.getSafeProfile, { userId: user._id });
    const token = await signPatrolToken({
      userId: user._id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken();
    await ctx.runMutation(internal.sessions.issue, {
      userId: user._id,
      tokenHash: await hashRefreshToken(refreshToken),
      familyId: crypto.randomUUID(),
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipAddress: requestIp(request),
    });
    await recordAudit(ctx, {
      convexId: user._id,
      role: user.role,
      clientId: user.clientId,
    }, "user.login", {
      details: `Login via ${clientType}`,
      ipAddress: requestIp(request),
    });
    return json({
      token,
      refreshToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      user: safeUser,
    });
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
    // A password change invalidates every session on every device — the
    // standard containment move when a password may have been compromised.
    await ctx.runMutation(internal.sessions.revokeAllForUser, {
      userId: stored._id,
    });
    return json({ message: "Password updated successfully" });
  }),
});

// Exchanges a valid refresh token for a fresh 30-minute access token AND a
// new refresh token (single-use rotation). Authenticated by the refresh token
// itself, so no Bearer header is required — and client-portal accounts may
// use it (their portal session has to survive past 30 minutes too).
http.route({
  path: "/auth/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await parseJson(request);
    const raw = String(body?.refreshToken ?? "").trim();
    if (!raw) return unauthorized("Refresh token required");

    const newRefreshToken = generateRefreshToken();
    const result = await ctx.runMutation(internal.sessions.rotate, {
      tokenHash: await hashRefreshToken(raw),
      newTokenHash: await hashRefreshToken(newRefreshToken),
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipAddress: requestIp(request),
    });

    if (result.status === "reused" && result.userId) {
      // Someone presented an already-rotated token: possible theft. The whole
      // family is revoked inside rotate(); leave a trail for investigation.
      const stolen = await ctx.runQuery(internal.users.getSafeProfile, {
        userId: result.userId as Id<"users">,
      });
      await recordAudit(ctx, {
        convexId: result.userId,
        role: stolen?.role ?? "unknown",
        clientId: stolen?.clientId ?? undefined,
      }, "user.session_reuse_detected", {
        details: "Rotated refresh token presented again; session family revoked",
        ipAddress: requestIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });
    }
    if (result.status === "recovered" && result.userId) {
      // The client re-presented a token whose rotation it never received, and
      // the replacement was still untouched — a lost-response retry, not theft.
      // rotate() kept the session alive and minted a fresh token; record it so
      // the recovery path is observable if it starts happening often.
      const recovered = await ctx.runQuery(internal.users.getSafeProfile, {
        userId: result.userId as Id<"users">,
      });
      await recordAudit(ctx, {
        convexId: result.userId,
        role: recovered?.role ?? "unknown",
        clientId: recovered?.clientId ?? undefined,
      }, "user.session_refresh_recovered", {
        details: "Refresh retried with a superseded token whose replacement was unused; session preserved",
        ipAddress: requestIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });
    }
    if ((result.status !== "ok" && result.status !== "recovered") || !result.userId) {
      return unauthorized("Session expired. Please sign in again.");
    }

    const profile = await ctx.runQuery(internal.users.getSafeProfile, {
      userId: result.userId as Id<"users">,
    });
    if (!profile || !profile.active) {
      return unauthorized("Session expired. Please sign in again.");
    }
    const token = await signPatrolToken({
      userId: result.userId,
      email: profile.email,
      role: profile.role,
    });
    return json({
      token,
      refreshToken: newRefreshToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      user: profile,
    });
  }),
});

// Revokes the presented refresh token's whole session family. Requires no
// Bearer header (the access token may already be expired at logout time) and
// always succeeds — logging out with a dead token is not an error.
http.route({
  path: "/auth/logout",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await parseJson(request);
    const raw = String(body?.refreshToken ?? "").trim();
    if (raw) {
      const userId = await ctx.runMutation(internal.sessions.revokeFamilyByHash, {
        tokenHash: await hashRefreshToken(raw),
      });
      if (userId) {
        const profile = await ctx.runQuery(internal.users.getSafeProfile, {
          userId: userId as Id<"users">,
        });
        await recordAudit(ctx, {
          convexId: userId,
          role: profile?.role ?? "unknown",
          clientId: profile?.clientId ?? undefined,
        }, "user.logout", {
          details: "Session revoked via /auth/logout",
          ipAddress: requestIp(request),
        });
      }
    }
    return json({ message: "Logged out" });
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

// Active emergency/SOS events raised by guards (a guard in trouble at their
// location). Used by the web Alerts page so staff can see and respond.
http.route({
  path: "/emergency/active",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    if (user.role === "guard") return forbidden("Supervisor access required");
    const url = new URL(request.url);
    return json(
      await ctx.runQuery(internal.emergency.listActive, {
        clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
        limit: Number(url.searchParams.get("limit") ?? 100),
      }),
    );
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
    const exportLimited = await enforceLimit(ctx, "export", user.convexId);
    if (exportLimited) return exportLimited;
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
    const scanLimited = await enforceLimit(ctx, "scan", user.convexId);
    if (scanLimited) return scanLimited;
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const body = await parseJson(request);
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    if (!checkpointId) {
      return notFound("Checkpoint not found");
    }
    let scan;
    try {
      scan = await ctx.runMutation(internal.scans.create, {
        officerId: _uid(user.convexId),
        checkpointId,
        gpsLatitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
        gpsLongitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
        notes: typeof body?.notes === "string" ? body.notes : undefined,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not assigned to this checkpoint")) {
        return forbidden("Officer is not assigned to this checkpoint's site");
      }
      if (err instanceof Error && err.message.includes("must clock in")) {
        return forbidden("You must clock in before you can scan a location.");
      }
      throw err;
    }
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
    return await jsonWithFile(
      user,
      await ctx.runQuery(internal.exports.listDailyExportsForUser, { userId: _uid(user.convexId) }),
    );
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
    // Store the storageId only. This used to persist ctx.storage.getUrl(),
    // a permanent public link to a CSV of a client's entire patrol history —
    // the same defect as the photo URLs, on more sensitive data. The link is
    // now minted per viewer, per request, and expires.
    const fileName = `daily-tour-${date}.csv`;
    const record = await ctx.runMutation(internal.exports.createDailyExportRecord, {
      userId: _uid(user.convexId),
      date,
      scopeLabel: user.clientName ?? "All clients",
      fileName,
      downloadUrl: storageId,
      storageId,
      totals,
    });
    return await jsonWithFile(user, record);
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
    return await jsonWithPhotos(user, await ctx.runQuery(internal.shifts.listAll, {
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
    return await jsonWithPhotos(
      user,
      await ctx.runQuery(internal.shifts.getStatusForUser, { userId: _uid(user.convexId) }),
    );
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
    // Direct upload: the phone has already put the bytes in storage and hands
    // us the id to validate and claim.
    let clockInPhotoRef: string | undefined;
    if (typeof body?.photoStorageId === "string" && body.photoStorageId) {
      const claimed = await claimUploadedPhoto(ctx, user, body.photoStorageId, "clock_in");
      if (claimed instanceof Response) return claimed;
      clockInPhotoRef = claimed.storageId;
    }
    let result;
    try {
      result = await ctx.runMutation(internal.shifts.clockIn, {
        userId: _uid(user.convexId),
        latitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
        longitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
        siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : undefined,
        clockInPhoto: clockInPhotoRef,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Already clocked in")) {
        return errorResponse("Already clocked in — end current shift first", 409);
      }
      throw err;
    }
    if (clockInPhotoRef) {
      await attachPhotos(ctx, user, [clockInPhotoRef], "shifts", String(result.shift.id));
    }
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
    let clockOutPhotoRef: string | undefined;
    if (typeof body?.photoStorageId === "string" && body.photoStorageId) {
      const claimed = await claimUploadedPhoto(ctx, user, body.photoStorageId, "clock_out");
      if (claimed instanceof Response) return claimed;
      clockOutPhotoRef = claimed.storageId;
    }
    const result = await ctx.runMutation(internal.shifts.clockOut, {
      shiftId: activeShift._id,
      latitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
      longitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
      clockOutPhoto: clockOutPhotoRef,
    });
    if (clockOutPhotoRef) {
      await attachPhotos(ctx, user, [clockOutPhotoRef], "shifts", String(activeShift._id));
    }
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
    // GPS pings are the highest-frequency write in the system. A misbehaving or
    // spoofed client can turn this into a firehose, so it's the first thing the
    // per-actor limit + global shedding protect.
    const positionLimited = await enforceLimit(ctx, "position", user.convexId);
    if (positionLimited) return positionLimited;
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
    const incidentLimited = await enforceLimit(ctx, "incident", user.convexId);
    if (incidentLimited) return incidentLimited;
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const body = await parseJson(request);
    const title = String(body?.title ?? "").trim();
    if (!title) return badRequest("title is required");
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    const category = INCIDENT_CATEGORIES.includes(body?.category)
      ? body.category
      : "Security Incident";
    const photoStorageIds: string[] = [];
    const storageIds = Array.isArray(body?.photoStorageIds) ? body.photoStorageIds : [];
    for (const storageId of storageIds.slice(0, 5)) {
      const claimed = await claimUploadedPhoto(ctx, user, storageId, "incident");
      if (claimed instanceof Response) return claimed;
      photoStorageIds.push(claimed.storageId);
    }
    const id = await ctx.runMutation(internal.incidents.create, {
      officerId: _uid(user.convexId),
      checkpointId,
      category,
      title,
      description: typeof body?.description === "string" ? body.description : undefined,
      photoStorageIds,
      severity:
        body?.severity === "low" ||
        body?.severity === "medium" ||
        body?.severity === "high" ||
        body?.severity === "critical"
          ? body.severity
          : undefined,
    });
    await attachPhotos(ctx, user, photoStorageIds, "incidents", String(id));
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
    const reportLimited = await enforceLimit(ctx, "report", user.convexId);
    if (reportLimited) return reportLimited;
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
    const maintLimited = await enforceLimit(ctx, "report", user.convexId);
    if (maintLimited) return maintLimited;
    const pendingPassOn = await requireNoPendingPassOnLogs(ctx, user);
    if (pendingPassOn) return pendingPassOn;
    const body = await parseJson(request);
    const title = String(body?.title ?? "").trim();
    const issue = String(body?.issue ?? "").trim();
    if (!title || !issue) {
      return badRequest("title and issue are required");
    }
    const checkpointId = await maybeResolveCheckpointId(ctx, body?.checkpointId);
    const evidenceStorageIds: string[] = [];
    const evidenceIds = Array.isArray(body?.evidenceStorageIds)
      ? body.evidenceStorageIds
      : [];
    for (const storageId of evidenceIds.slice(0, 5)) {
      const claimed = await claimUploadedPhoto(ctx, user, storageId, "maintenance");
      if (claimed instanceof Response) return claimed;
      evidenceStorageIds.push(claimed.storageId);
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
      evidenceStorageIds,
      gpsLatitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
      gpsLongitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
      checkpointId,
      siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : "",
      userId: _uid(user.convexId),
    });
    await attachPhotos(ctx, user, evidenceStorageIds, "reportSubmissions", String(id));
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
    // Safety-critical: NEVER shed an emergency by the global load breaker. We
    // still apply a generous per-actor cap (skipGlobal) so a stuck client can't
    // spam alerts, but a real panic press must always get through.
    const emergencyLimited = await enforceLimit(ctx, "emergency", user.convexId, { skipGlobal: true });
    if (emergencyLimited) return emergencyLimited;
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
    return await jsonWithPhotos(
      user,
      await ctx.runQuery(internal.postOrders.listForUser, { userId: _uid(user.convexId) }),
    );
  }),
});

// Staff management listing — created date, assigned guard names, and per-order
// acknowledgement history. Client accounts (main_account) are scoped to theirs.
http.route({
  path: "/post-orders/manage",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["admin", "main_account", "supervisor"]);
    if (roleErr) return roleErr;
    return await jsonWithPhotos(
      user,
      await ctx.runQuery(internal.postOrders.listForAdmin, {
        clientId: user.role === "admin" || user.role === "supervisor"
          ? undefined
          : _cid(user.clientId),
      }),
    );
  }),
});

// Delete a post order (and its acknowledgement rows). Staff-only.
http.route({
  pathPrefix: "/post-orders/",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["admin", "main_account", "supervisor"]);
    if (roleErr) return roleErr;
    const id = lastPathPart(request);
    const orderId = await ctx.runQuery(internal.postOrders.resolveId, { id });
    if (!orderId) return notFound("Post order not found");
    const result = await ctx.runMutation(internal.postOrders.remove, { orderId });
    await recordAudit(ctx, user, "post_order.deleted", {
      targetType: "post_order",
      targetId: orderId,
      details: `Deleted post order ${id}`,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
    return json(result);
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
      let proofPhotoStorageId: string | undefined;
      if (typeof body?.photoStorageId === "string" && body.photoStorageId) {
        const claimed = await claimUploadedPhoto(ctx, user, body.photoStorageId, "post_order_proof");
        if (claimed instanceof Response) return claimed;
        proofPhotoStorageId = claimed.storageId;
      }
      const completion = await ctx.runMutation(internal.postOrders.complete, {
        orderId,
        userId: _uid(user.convexId),
        proofNote: typeof body?.proofNote === "string" ? body.proofNote : undefined,
        gpsLatitude: typeof body?.gpsLatitude === "number" ? body.gpsLatitude : undefined,
        gpsLongitude: typeof body?.gpsLongitude === "number" ? body.gpsLongitude : undefined,
        proofPhotoStorageId,
      });
      if (proofPhotoStorageId) {
        await attachPhotos(
          ctx,
          user,
          [proofPhotoStorageId],
          "postOrderCompletions",
          String((completion as any)?.id ?? orderId),
        );
      }
      return await jsonWithPhotos(user, completion, { status: 201 });
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
    return await jsonWithPhotos(
      user,
      await ctx.runQuery(internal.handovers.listPendingForUser, { userId: _uid(user.convexId) }),
    );
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
    let photoStorageId: string | undefined;
    if (typeof body?.photoStorageId === "string" && body.photoStorageId) {
      const claimed = await claimUploadedPhoto(ctx, user, body.photoStorageId, "handover");
      if (claimed instanceof Response) return claimed;
      photoStorageId = claimed.storageId;
    }
    const result = await ctx.runMutation(internal.handovers.create, {
      userId: _uid(user.convexId),
      summary,
      openIssues: typeof body?.openIssues === "string" ? body.openIssues : undefined,
      equipmentStatus:
        typeof body?.equipmentStatus === "string" ? body.equipmentStatus : undefined,
      siteLabel: typeof body?.siteLabel === "string" ? body.siteLabel : undefined,
      photoStorageId,
      checkpointId,
    });
    if (photoStorageId) {
      await attachPhotos(ctx, user, [photoStorageId], "handovers", String(result.id));
    }
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
      officerId: user.role === "guard" ? _uid(user.convexId) : ((url.searchParams.get("officerId") ?? undefined) as any),
      status: (url.searchParams.get("status") ?? undefined) as "active" | "completed" | undefined,
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
      officerId: user.role === "guard" ? _uid(user.convexId) : ((url.searchParams.get("officerId") ?? undefined) as any),
      status: (url.searchParams.get("status") ?? undefined) as "active" | "completed" | undefined,
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
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  const profile = await ctx.runQuery(internal.users.getSafeProfile, { userId: _uid(user.convexId) });
  return json({ user: profile });
})});

// Self-service password reset is deliberately not offered. Client logins are
// created by staff from the client dashboard, which is also where the password
// is set; admin access uses a single shared credential for now. The previous
// /auth/forgot-password and /auth/reset-password routes were stubs that reported
// success without sending mail or writing a hash, so they are gone rather than
// left to lie to callers. Password changes go through /auth/change-password,
// which requires the current password.

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
  const detail = await ctx.runQuery(internal.scans.getDetail, { scanId });
  // Tenant-bound users only see scans belonging to their own account.
  if (detail && user.clientId && detail.clientId && detail.clientId !== user.clientId) {
    return notFound("Scan not found");
  }
  return json(detail);
})});

http.route({ path: "/checkpoints", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "main_account", "supervisor"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const name = String(body?.name ?? "").trim();
  if (!name) return badRequest("Sub-location name is required");
  // [client-structure] Sub-locations are plain QR points: GPS is optional
  // (scans verify against the parent site geofence), the QR code is
  // auto-generated when not supplied, and a parent site is required.
  if (!body?.siteId) return badRequest("A parent location (siteId) is required");
  const result = await ctx.runMutation(internal.checkpoints.create, {
    name,
    code: String(body?.code ?? "") || crypto.randomUUID(),
    latitude: body?.latitude === undefined || body?.latitude === null ? undefined : Number(body.latitude),
    longitude: body?.longitude === undefined || body?.longitude === null ? undefined : Number(body.longitude),
    radiusMeters: body?.radiusMeters === undefined || body?.radiusMeters === null ? undefined : Number(body.radiusMeters),
    expectedIntervalMinutes: Number(body?.expectedIntervalMinutes ?? 60),
    scheduledTimeIn: String(body?.scheduledTimeIn ?? ""),
    scheduledTimeOut: String(body?.scheduledTimeOut ?? ""),
    active: body?.active !== false, siteId: body?.siteId ?? undefined,
    // Tenant-bound users can only create points inside their own account.
    clientId: user.clientId ? _cid(user.clientId) : (body?.clientId ?? undefined),
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
  const url = new URL(request.url);
  const startRaw = url.searchParams.get("startDate");
  const endRaw = url.searchParams.get("endDate");
  const startDate = startRaw ? Date.parse(startRaw) : undefined;
  // An end DATE means "through the end of that day".
  const endDate = endRaw ? Date.parse(endRaw) + (endRaw.length <= 10 ? 86_399_999 : 0) : undefined;
  return await jsonWithPhotos(user, await ctx.runQuery(internal.reports.listAll, {
    clientId:
      user.role === "admin"
        ? _cid(url.searchParams.get("clientId"))
        : _cid(user.clientId),
    type: url.searchParams.get("type") ?? undefined,
    startDate: startDate != null && !Number.isNaN(startDate) ? startDate : undefined,
    endDate: endDate != null && !Number.isNaN(endDate) ? endDate : undefined,
  }));
})});

// Staff files a report from a category template and addresses it to the
// client who owns it — that's what routes it into the right portal inbox.
http.route({ path: "/reports", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "supervisor"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const clientId = await ctx.runQuery(internal.clients.resolveId, {
    id: String(body?.clientId ?? ""),
  });
  if (!clientId) return notFound("Client not found");
  const siteId = body?.siteId
    ? await ctx.runQuery(internal.sites.resolveId, { id: String(body.siteId) })
    : null;
  if (body?.siteId && !siteId) return notFound("Location not found");
  let result;
  try {
    result = await ctx.runMutation(internal.reports.createFromTemplate, {
      userId: _uid(user.convexId),
      category: String(body?.category ?? ""),
      clientId,
      siteId: siteId ?? undefined,
      title: body?.title === undefined ? undefined : String(body.title),
      fields: body?.fields ?? {},
    });
  } catch (err) {
    // Convex prefixes mutation errors with "Uncaught Error:" and a stack
    // line — show the user only the actual validation message.
    const raw = err instanceof Error ? err.message : "Invalid report";
    return badRequest(raw.replace(/^Uncaught Error:\s*/, "").split("\n")[0].trim());
  }
  await recordAudit(ctx, user, "report.submitted", {
    targetType: "report",
    targetId: String(result.id),
    details: `Filed ${result.type} report: ${result.title}`,
    ipAddress: requestIp(request),
  });
  return json(result, { status: 201 });
})});

http.route({ path: "/reports/generate", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const body = await parseJson(request);
  return json(await ctx.runMutation(internal.reports.generate, {
    userId: _uid(user.convexId), type: body?.type, dateRange: body?.dateRange,
  }));
})});

// Send (or resend) a drafted report to a client — flips it to "sent" so it
// appears in the client portal. Optional clientId in the body lets staff pick
// exactly which client receives it. Staff-only.
http.route({ pathPrefix: "/reports/", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const id = lastPathPart(request, 1);
  const action = lastPathPart(request);
  if (!id || (action !== "send" && action !== "resend")) {
    return notFound("Report route not found");
  }
  const roleErr = requireRole(user, ["admin", "supervisor"]);
  if (roleErr) return roleErr;
  const reportId = await ctx.runQuery(internal.reports.resolveId, { id });
  if (!reportId) return notFound("Report not found");
  const body = await parseJson(request);
  const clientId = body?.clientId
    ? await ctx.runQuery(internal.clients.resolveId, { id: String(body.clientId) })
    : null;
  if (body?.clientId && !clientId) return notFound("Client not found");
  let result;
  try {
    result = await ctx.runMutation(internal.reports.sendToClient, {
      reportId,
      clientId: clientId ?? undefined,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Could not send report";
    return badRequest(raw.replace(/^Uncaught Error:\s*/, "").split("\n")[0].trim());
  }
  await recordAudit(ctx, user, "report.sent", {
    targetType: "report",
    targetId: String(result.id),
    details: `Sent report to ${result.clientName ?? "client"}`,
    ipAddress: requestIp(request),
  });
  return json(result);
})});

// Streams the report as a real generated PDF (cached in storage after the
// first request — submissions are immutable). Guards may only pull their own.
http.route({ pathPrefix: "/reports/", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const id = lastPathPart(request, 1);
  const action = lastPathPart(request);
  if (!id || action !== "pdf") return notFound("Report route not found");
  const reportId = await ctx.runQuery(internal.reports.resolveId, { id });
  if (!reportId) return notFound("Report not found");
  const access = await ctx.runQuery(internal.reports.getAccessInfo, { reportId });
  if (!access) return notFound("Report not found");
  if (user.role === "guard" && access.userId !== user.convexId) {
    return forbidden("You can only download your own reports");
  }
  const storageId =
    access.pdfStorageId ??
    (await ctx.runAction(internal.pdfService.generateReportPdf, {
      reportId,
      variant: "staff",
    }));
  return servePdf(ctx, storageId, `report-${id}.pdf`);
})});

// Portal variant of the same PDF: tenant-checked and guard-anonymized.
http.route({ pathPrefix: "/client/reports/", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  if (user.role !== "main_account") return forbidden("The client portal is for client accounts only.");
  const id = lastPathPart(request, 1);
  const action = lastPathPart(request);
  if (!id || action !== "pdf") return notFound("Report route not found");
  const reportId = await ctx.runQuery(internal.reports.resolveId, { id });
  if (!reportId) return notFound("Report not found");
  const access = await ctx.runQuery(internal.reports.getAccessInfo, { reportId });
  // Portal can only see reports that belong to this client AND have been sent —
  // drafts and internal reports never reach the client, even by direct URL.
  if (
    !access ||
    !access.clientId ||
    access.clientId !== user.clientId ||
    access.status !== "sent"
  ) {
    return notFound("Report not found");
  }
  const storageId =
    access.portalPdfStorageId ??
    (await ctx.runAction(internal.pdfService.generateReportPdf, {
      reportId,
      variant: "portal",
    }));
  return servePdf(ctx, storageId, `report-${id}.pdf`);
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

// Pre-flight for the delete confirmations: what a delete would remove, and
// what it would keep. A flat path rather than `/users/{id}/deletion-impact`
// because the `/users/` and `/sites/` prefixes are already claimed by
// single-resource handlers.
http.route({ path: "/deletion-impact", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required");
  if (type === "user") {
    const userId = await ctx.runQuery(internal.users.resolveId, { id });
    if (!userId) return notFound("User not found");
    const impact = await ctx.runQuery(internal.users.getDeletionImpact, { userId });
    if (!impact) return notFound("User not found");
    return json(impact);
  }
  if (type === "site") {
    const siteId = await ctx.runQuery(internal.sites.resolveId, { id });
    if (!siteId) return notFound("Location not found");
    const impact = await ctx.runQuery(internal.sites.getDeletionImpact, { siteId });
    if (!impact) return notFound("Location not found");
    return json(impact);
  }
  return badRequest("type must be 'user' or 'site'");
})});

// Removes a guard from the system after they leave: profile, login and
// postings go, patrol history stays. See `users.remove` for why.
http.route({ pathPrefix: "/users/", method: "DELETE", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;
  const id = lastPathPart(request);
  if (!id) return badRequest("User ID required");
  const userId = await ctx.runQuery(internal.users.resolveId, { id });
  if (!userId) return notFound("User not found");
  // Deleting yourself revokes your own session mid-request and locks the
  // account out of the dashboard it is using.
  if (_uid(user.convexId) === userId) {
    return badRequest("You cannot delete your own account");
  }
  const impact = await ctx.runQuery(internal.users.getDeletionImpact, { userId });
  if (!impact) return notFound("User not found");
  // A client's portal login is created and owned by the Clients page; deleting
  // one here would strand that client with no way into their portal.
  if (impact.role === "main_account") {
    return badRequest("Portal logins are managed on the client's page, not here");
  }
  if (impact.isLastAdmin) {
    return badRequest("This is the only admin account — create another admin before deleting this one");
  }
  const result = await ctx.runMutation(internal.users.remove, {
    userId,
    deletedByUserId: _uid(user.convexId),
    deletedByName: user.name,
  });
  if (!result) return notFound("User not found");
  await recordAudit(ctx, user, "user.deleted", {
    targetType: "user",
    targetId: userId as string,
    details:
      `Deleted ${result.role} "${result.name}" — patrol history kept ` +
      `(${impact.scans} scan(s), ${impact.shifts} shift(s), ${impact.incidents} incident(s)); ` +
      `${result.sessionsRevoked} session(s) revoked, ${result.assignmentsRemoved} posting(s) removed, ` +
      `${result.shiftsClosed} open shift(s) closed`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json({ message: `${result.name} deleted`, ...result });
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
  return await jsonWithPhotos(user, await ctx.runQuery(internal.incidents.listForApi, {
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

  return await jsonWithPhotos(user, result);
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
  return await jsonWithPhotos(user, await ctx.runQuery(internal.postOrders.listCompletions, {
    clientId: user.role === "admin" ? undefined : (_cid(user.clientId)),
  }));
})});

http.route({ path: "/post-orders", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "main_account", "supervisor"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  // Scope: a sub-location (checkpointId) or a whole location (siteId) —
  // resolved here so legacy IDs from older data keep working.
  const checkpointId = body?.checkpointId
    ? await ctx.runQuery(internal.checkpoints.resolveId, { id: String(body.checkpointId) })
    : null;
  if (body?.checkpointId && !checkpointId) return notFound("Sub-location not found");
  const siteId = body?.siteId
    ? await ctx.runQuery(internal.sites.resolveId, { id: String(body.siteId) })
    : null;
  if (body?.siteId && !siteId) return notFound("Location not found");
  const result = await ctx.runMutation(internal.postOrders.create, {
    title: String(body?.title ?? ""), summary: String(body?.summary ?? ""),
    instructions: String(body?.instructions ?? ""),
    checkpointId: checkpointId ?? undefined,
    siteId: siteId ?? undefined,
    assignedUserId: body?.assignedUserId ?? undefined,
    assignedUserIds: Array.isArray(body?.assignedUserIds)
      ? body.assignedUserIds.filter((x: unknown) => typeof x === "string" && x)
      : undefined,
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
  if (body.requiresAcknowledgement !== undefined) fields.requiresAcknowledgement = Boolean(body.requiresAcknowledgement);
  if (body.requiresPhotoProof !== undefined) fields.requiresPhotoProof = Boolean(body.requiresPhotoProof);
  if (["admin","main_account","supervisor","guard"].includes(String(body?.assignedRole))) fields.assignedRole = String(body.assignedRole);
  if (Array.isArray(body.assignedUserIds)) {
    fields.assignedUserIds = body.assignedUserIds.filter((x: unknown) => typeof x === "string" && x);
  }
  // Scope edits: resolve legacy IDs; an empty string clears the scope.
  if (body.checkpointId !== undefined) {
    if (!body.checkpointId) {
      fields.checkpointId = null;
    } else {
      const cpId = await ctx.runQuery(internal.checkpoints.resolveId, { id: String(body.checkpointId) });
      if (!cpId) return notFound("Sub-location not found");
      fields.checkpointId = cpId;
    }
  }
  if (body.siteId !== undefined) {
    if (!body.siteId) {
      fields.siteId = null;
    } else {
      const sId = await ctx.runQuery(internal.sites.resolveId, { id: String(body.siteId) });
      if (!sId) return notFound("Location not found");
      fields.siteId = sId;
    }
  }
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
  return await jsonWithPhotos(user, await ctx.runQuery(internal.handovers.listAll, {
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

// [client-structure] Creating a client now provisions the company AND its
// portal login (main_account user) in one transaction. Password is required —
// there is deliberately no default.
http.route({ path: "/clients", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!name) return badRequest("Company name is required");
  if (!email) return badRequest("Email is required");
  if (password.length < 8) return badRequest("Password must be at least 8 characters");
  let result;
  try {
    result = await ctx.runMutation(internal.clients.createWithLogin, {
      name, email,
      phone: String(body?.phone ?? ""),
      passwordHash: await bcrypt.hash(password, 10),
      active: body?.active !== false,
    });
  } catch (error: any) {
    if (String(error?.message ?? "").includes("already exists")) {
      return conflict("A user with this email already exists");
    }
    throw error;
  }
  await recordAudit(ctx, user, "client.created", {
    targetType: "client",
      targetId: result.id as unknown as string,
      details: `Created client account with portal login: ${name}`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json(result, { status: 201 });
})});

// [client-structure] Admin drill-down for one client account: company info,
// portal logins, and the Location -> Sub-location tree with scan activity.
http.route({ pathPrefix: "/clients/", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const id = lastPathPart(request);
  if (!id) return badRequest("Client ID required");
  const clientId = await ctx.runQuery(internal.clients.resolveId, { id });
  if (!clientId) return notFound("Client not found");
  if (user.role !== "admin" && _cid(user.clientId) !== clientId) {
    return forbidden("Access denied");
  }
  const detail = await ctx.runQuery(internal.clients.getDetail, { clientId });
  if (!detail) return notFound("Client not found");
  return json(detail);
})});

// [client-structure] Update client account info (kept in step with the
// portal login inside the mutation).
http.route({ pathPrefix: "/clients/", method: "PUT", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;
  const id = lastPathPart(request);
  if (!id) return badRequest("Client ID required");
  const clientId = await ctx.runQuery(internal.clients.resolveId, { id });
  if (!clientId) return notFound("Client not found");
  const body = await parseJson(request);
  const result = await ctx.runMutation(internal.clients.update, {
    clientId,
    name: body.name === undefined ? undefined : String(body.name),
    email: body.email === undefined ? undefined : String(body.email).trim().toLowerCase(),
    phone: body.phone === undefined ? undefined : String(body.phone),
    active: body.active === undefined ? undefined : Boolean(body.active),
  }).catch(() => null);
  if (!result) return notFound("Client not found");
  await recordAudit(ctx, user, "client.updated", {
    targetType: "client", targetId: id,
    details: `Updated client: ${result.name}`,
  });
  return json(result);
})});

// [client-structure] Client-portal view of the tenant's own hierarchy:
// locations -> sub-locations with scan/verification activity. Tenant is
// resolved from the session token ONLY — the portal never sends a clientId.
http.route({ path: "/client/sites", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  if (user.role !== "main_account") return forbidden("The client portal is for client accounts only.");
  const clientId = _cid(user.clientId);
  if (!clientId) return json({ sites: [] });
  const detail = await ctx.runQuery(internal.clients.getDetail, { clientId });
  if (!detail) return json({ sites: [] });
  // Deliberately omit portal logins and any staff/guard identity data
  // (assignedGuards carries guard names for the staff dashboard only).
  return json({
    sites: detail.sites.map(({ assignedGuards: _assignedGuards, ...site }) => site),
  });
})});

// [client-structure] Assign/unassign a guard to a site. Scans at a site are
// rejected unless the guard is assigned, so staff need this when they add a
// new client location.
http.route({ path: "/site-assignments", method: "POST", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "supervisor"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const siteId = await ctx.runQuery(internal.sites.resolveId, { id: String(body?.siteId ?? "") });
  if (!siteId) return notFound("Site not found");
  const userId = await ctx.runQuery(internal.users.resolveId, { id: String(body?.userId ?? "") });
  if (!userId) return notFound("User not found");
  const result = await ctx.runMutation(internal.sites.assignUser, { siteId, userId });
  if ("conflict" in result && result.conflict) {
    return conflict(
      `This guard is already assigned to "${result.otherSiteName}". Unassign them from that location first before assigning them here.`,
    );
  }
  await recordAudit(ctx, user, "site.guard_assigned", {
    targetType: "site", targetId: siteId,
    details: `Assigned user ${userId} to site ${siteId}`,
  });
  return json(result, { status: result.alreadyAssigned ? 200 : 201 });
})});

http.route({ path: "/site-assignments", method: "DELETE", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "supervisor"]);
  if (roleErr) return roleErr;
  const body = await parseJson(request);
  const siteId = await ctx.runQuery(internal.sites.resolveId, { id: String(body?.siteId ?? "") });
  if (!siteId) return notFound("Site not found");
  const userId = await ctx.runQuery(internal.users.resolveId, { id: String(body?.userId ?? "") });
  if (!userId) return notFound("User not found");
  const result = await ctx.runMutation(internal.sites.unassignUser, { siteId, userId });
  await recordAudit(ctx, user, "site.guard_unassigned", {
    targetType: "site", targetId: siteId,
    details: `Unassigned user ${userId} from site ${siteId}`,
  });
  return json(result);
})});

// [client-structure] Portal overview: only NUMBERS for guards (AGM rule —
// clients never see guard identities), plus site list and scan activity.
http.route({ path: "/client/overview", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  if (user.role !== "main_account") return forbidden("The client portal is for client accounts only.");
  const clientId = _cid(user.clientId);
  if (!clientId) {
    return json({ guardsOnDuty: 0, totalGuards: 0, sites: [], scansToday: 0, lastScanAt: null, coveragePct: null });
  }
  return json(await ctx.runQuery(internal.clients.portalOverview, { clientId }));
})});

// [client-structure] Portal patrol activity — guard identities anonymized.
http.route({ path: "/client/scans", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  if (user.role !== "main_account") return forbidden("The client portal is for client accounts only.");
  const clientId = _cid(user.clientId);
  if (!clientId) return json([]);
  const url = new URL(request.url);
  const rawCheckpoint = url.searchParams.get("checkpointId");
  const checkpointId = rawCheckpoint
    ? await ctx.runQuery(internal.checkpoints.resolveId, { id: rawCheckpoint })
    : null;
  // A checkpoint filter that doesn't resolve must return nothing, not fall
  // back to the whole tenant feed.
  if (rawCheckpoint && !checkpointId) return json([]);
  return json(await ctx.runQuery(internal.clients.portalScans, {
    clientId,
    checkpointId: checkpointId ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 50),
  }));
})});

// [client-structure] Guard STATISTICS only — never identities (AGM rule):
// "Assigned 7 / Clocked In 4 / Pending 3", no names, no photos.
http.route({ path: "/client/guard-stats", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  if (user.role !== "main_account") return forbidden("The client portal is for client accounts only.");
  const clientId = _cid(user.clientId);
  if (!clientId) return json({ assigned: 0, clockedIn: 0, pending: 0 });
  return json(await ctx.runQuery(internal.clients.portalGuardStats, { clientId }));
})});

// [client-structure] Flat checkpoint list for the portal (compat shape).
http.route({ path: "/client/checkpoints", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  if (user.role !== "main_account") return forbidden("The client portal is for client accounts only.");
  const clientId = _cid(user.clientId);
  if (!clientId) return json([]);
  return json(await ctx.runQuery(internal.clients.portalCheckpoints, { clientId }));
})});

// [client-structure] Portal report inbox (list of submitted reports).
http.route({ path: "/client/reports", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  if (user.role !== "main_account") return forbidden("The client portal is for client accounts only.");
  const clientId = _cid(user.clientId);
  if (!clientId) return json([]);
  return json(await ctx.runQuery(internal.clients.portalReports, { clientId }));
})});

// Removes a location the company no longer covers: the site, its QR points
// and its guard postings go, the patrol history taken there stays.
// Admin-only — unlike the PUT above, this is not recoverable by editing.
http.route({ pathPrefix: "/sites/", method: "DELETE", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;
  const id = lastPathPart(request);
  if (!id) return badRequest("Site ID required");
  const siteId = await ctx.runQuery(internal.sites.resolveId, { id });
  if (!siteId) return notFound("Location not found");
  const impact = await ctx.runQuery(internal.sites.getDeletionImpact, { siteId });
  if (!impact) return notFound("Location not found");
  const result = await ctx.runMutation(internal.sites.remove, {
    siteId,
    deletedByUserId: _uid(user.convexId),
    deletedByName: user.name,
  });
  if (!result) return notFound("Location not found");
  await recordAudit(ctx, user, "site.deleted", {
    targetType: "site",
    targetId: siteId as string,
    details:
      `Deleted location "${result.name}" — patrol history kept (${impact.scans} scan(s)); ` +
      `${result.checkpointsRemoved} QR code(s) removed, ${result.assignmentsRemoved} posting(s) removed, ` +
      `${result.postOrdersDeactivated} post order(s) deactivated`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json({ message: `${result.name} deleted`, ...result });
})});

http.route({ path: "/sites", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const queryClientId = url.searchParams.get("clientId");
  // Tenant-bound users can never widen their scope via the query param;
  // unscoped staff (admin/supervisor) may filter by client with it.
  const effectiveClientId = user.clientId
    ? _cid(user.clientId)
    : queryClientId || undefined;
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
    address: body?.address === undefined ? undefined : String(body.address),
    latitude: body?.latitude === undefined || body?.latitude === null ? undefined : Number(body.latitude),
    longitude: body?.longitude === undefined || body?.longitude === null ? undefined : Number(body.longitude),
    radiusMeters: body?.radiusMeters === undefined || body?.radiusMeters === null ? undefined : Number(body.radiusMeters),
    clientId: String(body?.clientId ?? "") as Id<"clients">,
    active: body?.active !== false,
    patrolIntervalMinutes: body?.patrolIntervalMinutes === undefined ? undefined : Number(body.patrolIntervalMinutes),
    patrolGracePeriodMinutes: body?.patrolGracePeriodMinutes === undefined ? undefined : Number(body.patrolGracePeriodMinutes),
  });
  if (!result) return notFound("Site could not be created");
  // [client-structure] Every location gets its own scannable QR point,
  // separate from the sub-locations staff add inside it.
  await ctx.runMutation(internal.checkpoints.create, {
    name: String(body?.name ?? ""),
    code: crypto.randomUUID(),
    expectedIntervalMinutes: 60,
    scheduledTimeIn: "",
    scheduledTimeOut: "",
    active: true,
    siteId: result.convexId as Id<"sites">,
    isPrimary: true,
  });
  await recordAudit(ctx, user, "site.created", {
    targetType: "site",
      targetId: result.id as unknown as string,
      details: `Created site: ${body?.name}`,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
  });
  return json(result, { status: 201 });
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
  const updated = await ctx.runMutation(internal.sites.update, {
    siteId, name: body.name, location: body.location, active: body.active,
    address: body.address === undefined ? undefined : String(body.address),
    latitude: body.latitude === undefined || body.latitude === null ? undefined : Number(body.latitude),
    longitude: body.longitude === undefined || body.longitude === null ? undefined : Number(body.longitude),
    radiusMeters: body.radiusMeters === undefined || body.radiusMeters === null ? undefined : Number(body.radiusMeters),
    patrolIntervalMinutes: body.patrolIntervalMinutes === undefined ? undefined : Number(body.patrolIntervalMinutes),
    patrolGracePeriodMinutes: body.patrolGracePeriodMinutes === undefined ? undefined : Number(body.patrolGracePeriodMinutes),
  });
  if (!updated) return notFound("Site not found");

  // The geofence decides whether a scan counts as verified evidence, and a
  // scan stores the distance it measured rather than recomputing it later.
  // Move the coordinates or the radius and every scan taken before the move
  // is left reporting a distance to somewhere the location no longer is —
  // with nothing on the record to say why. So the before/after values are
  // named here, not just the fact that an edit happened: without them the
  // only way to explain an old distance is to guess the old geofence from
  // the arithmetic. `site.updated` was already a declared sensitive action;
  // it had simply never been emitted.
  const changes: string[] = [];
  const geofenceMoved =
    updated.latitude !== site.latitude ||
    updated.longitude !== site.longitude ||
    updated.radiusMeters !== site.radiusMeters;
  if (updated.name !== site.name) changes.push(`name: "${site.name}" -> "${updated.name}"`);
  if (updated.location !== site.location) changes.push(`location: "${site.location}" -> "${updated.location}"`);
  if (updated.address !== site.address) changes.push(`address: "${site.address ?? ""}" -> "${updated.address ?? ""}"`);
  if (updated.latitude !== site.latitude || updated.longitude !== site.longitude) {
    changes.push(`coordinates: ${site.latitude ?? "none"},${site.longitude ?? "none"} -> ${updated.latitude ?? "none"},${updated.longitude ?? "none"}`);
  }
  if (updated.radiusMeters !== site.radiusMeters) {
    changes.push(`geofence radius: ${site.radiusMeters ?? "default"}m -> ${updated.radiusMeters ?? "default"}m`);
  }
  if (updated.active !== site.active) changes.push(`active: ${site.active} -> ${updated.active}`);
  if (updated.patrolIntervalMinutes !== site.patrolIntervalMinutes) {
    changes.push(`patrol interval: ${site.patrolIntervalMinutes ?? "none"} -> ${updated.patrolIntervalMinutes ?? "none"}`);
  }
  if (updated.patrolGracePeriodMinutes !== site.patrolGracePeriodMinutes) {
    changes.push(`patrol grace: ${site.patrolGracePeriodMinutes ?? "none"} -> ${updated.patrolGracePeriodMinutes ?? "none"}`);
  }

  if (changes.length > 0) {
    await recordAudit(ctx, user, "site.updated", {
      targetType: "site",
      targetId: String(site.id),
      siteId: String(siteId),
      details: `Updated site ${site.name}${geofenceMoved ? " [geofence moved]" : ""}: ${changes.join("; ")}`,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    });
  }
  return json(updated);
})});

// --- Photos: direct upload + authorized read ------------------------------
//
// Bytes never travel through this API. The client asks for a one-shot upload
// URL, PUTs the file straight to storage, then hands back the storageId for
// validation. Reading goes the other way: a storageId is only ever exchanged
// for a short-lived signed URL by a handler that has already authorized the
// viewer, and /photos verifies that signature before streaming anything.

http.route({
  path: "/uploads/url",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    // Every role that can create a record carrying a photo. Client accounts
    // (main_account) submit nothing from the field and get no upload capability.
    const roleErr = requireRole(user, ["guard", "supervisor", "admin"]);
    if (roleErr) return roleErr;
    return json({ uploadUrl: await ctx.storage.generateUploadUrl() });
  }),
});

http.route({
  path: "/uploads/claim",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const user = await requireAuth(ctx, request);
    if (!user) return unauthorized();
    const roleErr = requireRole(user, ["guard", "supervisor", "admin"]);
    if (roleErr) return roleErr;
    const body = await parseJson(request);
    const kind = PHOTO_KINDS.includes(body?.kind) ? (body.kind as PhotoKind) : null;
    if (!kind) {
      return badRequest(`kind must be one of: ${PHOTO_KINDS.join(", ")}`);
    }
    const claimed = await claimUploadedPhoto(ctx, user, body?.storageId, kind);
    if (claimed instanceof Response) return claimed;
    return json({ storageId: claimed.storageId }, { status: 201 });
  }),
});

http.route({
  pathPrefix: "/photos/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // Authorization rides in the signed token rather than a Bearer header: an
    // <img> tag cannot set headers, and the alternative — handing out Convex's
    // permanent public storage URLs — is what this whole change exists to kill.
    const storageId = lastPathPart(request);
    if (!storageId) return notFound("Photo not found");
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return unauthorized();

    const claims = await verifyPhotoToken(token);
    if (!claims) return unauthorized();
    // The token names the one blob it may read; the path cannot widen it.
    if (claims.sid !== storageId) return forbidden("Token does not cover this photo");

    // Defence in depth: even with a valid token, re-check the asset's owner, so
    // a bug in any single read path cannot leak one client's photos to another.
    // Assets predating this table carry no owner and fall back to the token
    // check alone.
    const asset = await ctx.runQuery(internal.photos.assetByStorageId, {
      storageId: storageId as Id<"_storage">,
    });
    if (asset?.clientId) {
      const isStaff = claims.role === "admin" || claims.role === "supervisor";
      const sameTenant =
        !!claims.cid && String(asset.clientId) === String(claims.cid);
      // A guard usually has no clientId at all — they belong to a tenant only
      // via their site — so "I took this photo" is the check that applies to
      // them. Without it every guard would be refused their own evidence.
      const isUploader =
        !!claims.uid && String(asset.uploadedBy) === String(claims.uid);
      if (!isStaff && !sameTenant && !isUploader) {
        return forbidden("Photo belongs to another organization");
      }
    }

    const blob = await ctx.storage.get(storageId as Id<"_storage">);
    if (!blob) return notFound("Photo not found");
    return new Response(blob, {
      headers: {
        "Content-Type": asset?.contentType || blob.type || "image/jpeg",
        // Private: the URL is a short-lived capability, so it must not be held
        // in a shared cache. The browser may keep it for the token's lifetime.
        "Cache-Control": "private, max-age=600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// Exports (CSV/XLSX of patrol data) live in the same storage as photos and were
// previously handed out as permanent public URLs. Same capability model, but a
// download rather than an inline image.
http.route({
  pathPrefix: "/files/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const storageId = lastPathPart(request);
    if (!storageId) return notFound("File not found");
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return unauthorized();
    const claims = await verifyPhotoToken(token);
    if (!claims) return unauthorized();
    if (claims.sid !== storageId) return forbidden("Token does not cover this file");

    const blob = await ctx.storage.get(storageId as Id<"_storage">);
    if (!blob) return notFound("File not found");
    return new Response(blob, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Content-Disposition": "attachment",
        "Cache-Control": "private, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// A client account with no tenant attached has no data to aggregate. Shaped
// like a real (empty) result so the UI renders zeroes instead of an error.
const EMPTY_ANALYTICS = {
  range: { since: 0, until: 0, days: 0 },
  truncated: false,
  totals: {
    patrols: 0, verifiedPatrols: 0, verificationRate: null, incidents: 0,
    openIncidents: 0, reports: 0, shifts: 0, dutyHours: 0, avgShiftHours: null,
    activeGuards: 0, sites: 0,
  },
  series: [],
  sites: [],
  incidentsBySeverity: [],
  incidentsByCategory: [],
  topGuards: [],
};

// Patrol analytics for the staff dashboard. Staff only: client accounts sign in
// through the portal and use /client/analytics, and requireAuth rejects portal
// tokens here regardless. A tenant-bound caller is still pinned to its own
// client and cannot widen scope via ?clientId, matching what /sites enforces.
http.route({ path: "/analytics", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request);
  if (!user) return unauthorized();
  const roleErr = requireRole(user, ["admin", "supervisor"]);
  if (roleErr) return roleErr;

  const url = new URL(request.url);
  const clientId = user.clientId
    ? _cid(user.clientId)
    : _cid(url.searchParams.get("clientId"));

  const rawSite = url.searchParams.get("siteId");
  const siteId = rawSite
    ? await ctx.runQuery(internal.sites.resolveId, { id: rawSite })
    : null;
  // An unresolvable site filter must return that site's (empty) analytics, not
  // silently widen to everything.
  if (rawSite && !siteId) return notFound("Site not found");

  return json(await ctx.runQuery(internal.analytics.summary, {
    clientId,
    siteId: siteId ?? undefined,
    days: Number(url.searchParams.get("days") ?? 30),
    includeGuards: true,
  }));
})});

// [client-structure] Portal analytics — same aggregates, tenant-pinned, and
// never carrying guard identities (AGM rule).
http.route({ path: "/client/analytics", method: "GET", handler: httpAction(async (ctx, request) => {
  const user = await requireAuth(ctx, request, { allowClientPortal: true });
  if (!user) return unauthorized();
  if (user.role !== "main_account") return forbidden("The client portal is for client accounts only.");
  const clientId = _cid(user.clientId);
  if (!clientId) return json(EMPTY_ANALYTICS);

  const url = new URL(request.url);
  const rawSite = url.searchParams.get("siteId");
  const siteId = rawSite
    ? await ctx.runQuery(internal.sites.resolveId, { id: rawSite })
    : null;
  if (rawSite && !siteId) return notFound("Site not found");

  return json(await ctx.runQuery(internal.analytics.summary, {
    clientId,
    siteId: siteId ?? undefined,
    days: Number(url.searchParams.get("days") ?? 30),
    includeGuards: false,
  }));
})});

export default http;
