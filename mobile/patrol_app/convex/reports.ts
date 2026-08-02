import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getReportTemplate, validateTemplateFields } from "./lib/reportTemplates";
import { deletedNamesByType } from "./lib/tombstones";

export const listSubmissions = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const query = args.userId
      ? ctx.db.query("reportSubmissions").withIndex("by_userId_submittedAt", (q) =>
          q.eq("userId", args.userId!),
        ).order("desc")
      : args.type
        ? ctx.db.query("reportSubmissions").withIndex("by_type", (q) => q.eq("type", args.type!)).order("desc")
        : ctx.db.query("reportSubmissions").order("desc");
    let submissions = await query.take(100);

    if (args.userId && args.type) {
      submissions = submissions.filter(
        (submission) => submission.type === args.type,
      );
    }

    return submissions;
  },
});

export const listAll = internalQuery({
  args: {
    clientId: v.optional(v.id("clients")),
    type: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = args.clientId
      ? ctx.db.query("reportSubmissions").withIndex("by_clientId_submittedAt", (q) =>
          q.eq("clientId", args.clientId),
        )
      : ctx.db.query("reportSubmissions").withIndex("by_submittedAt");
    let subs = await query.order("desc").take(500);
    const users = await ctx.db.query("users").collect();
    const clients = await ctx.db.query("clients").collect();
    if (args.clientId) {
      const clientUserIds = new Set(
        users.filter((u) => u.clientId === args.clientId).map((u) => u._id),
      );
      subs = subs.filter(
        (s) => s.clientId === args.clientId || clientUserIds.has(s.userId),
      );
    }
    if (args.type) subs = subs.filter((s) => s.type === args.type);
    if (args.startDate != null) subs = subs.filter((s) => s.submittedAt >= args.startDate!);
    if (args.endDate != null) subs = subs.filter((s) => s.submittedAt <= args.endDate!);
    return {
      reports: [],
      submissions: subs.slice(0, 200).map((s) => ({
        id: s.legacyId ?? s._id,
        type: s.type,
        title: s.title,
        summary: s.summary,
        // Structured template fields — the admin "View" modal renders these.
        details: s.details ?? {},
        status: s.status,
        siteLabel: s.siteLabel,
        clientId: s.clientId ?? null,
        clientName: clients.find((c) => c._id === s.clientId)?.name ?? null,
        userName: users.find((u) => u._id === s.userId)?.name ?? "",
        submittedAt: new Date(s.submittedAt).toISOString(),
        emailedAt: s.emailedAt ? new Date(s.emailedAt).toISOString() : null,
      })),
    };
  },
});

// Staff-authored report from a category template (see lib/reportTemplates).
// Every report belongs to a client — that's what routes it into the right
// portal inbox — and optionally to one of that client's locations.
export const createFromTemplate = internalMutation({
  args: {
    userId: v.id("users"),
    category: v.string(),
    clientId: v.id("clients"),
    siteId: v.optional(v.id("sites")),
    title: v.optional(v.string()),
    fields: v.any(),
  },
  handler: async (ctx, args) => {
    const template = getReportTemplate(args.category);
    if (!template) throw new Error(`Unknown report category: ${args.category}`);
    const validated = validateTemplateFields(
      template,
      (args.fields ?? {}) as Record<string, unknown>,
    );
    if (!validated.ok) throw new Error(validated.error);

    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Client not found");
    const site = args.siteId ? await ctx.db.get(args.siteId) : null;
    if (args.siteId && !site) throw new Error("Location not found");
    if (site && site.clientId !== args.clientId) {
      throw new Error("Location does not belong to the selected client");
    }

    const title =
      sanitize(String(args.title ?? "").trim()) ||
      `${template.label} - ${new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos",
      })}`;
    // First textarea answer doubles as the list/PDF summary line.
    const summarySource = template.fields.find(
      (f) => f.type === "textarea" && validated.fields[f.key],
    );
    const summary = summarySource ? validated.fields[summarySource.key] : template.description;

    const submittedAt = Date.now();
    const id = await ctx.db.insert("reportSubmissions", {
      clientId: args.clientId,
      siteId: site?._id,
      type: template.category,
      title,
      summary: sanitize(summary).slice(0, 500),
      details: validated.fields,
      siteLabel: site?.name ?? "",
      userId: args.userId,
      // Staff-authored reports start as a private DRAFT. They only reach the
      // client portal once staff explicitly send them (see sendToClient).
      status: "draft",
      submittedAt,
      deliveryPayload: {},
    });
    return { id, title, type: template.category, status: "draft" };
  },
});

// Deliver a drafted report to a client: mark it sent (portal now shows it) and
// stamp the send time. An optional clientId lets staff pick/confirm exactly
// which client receives it. Cached PDFs are dropped so they re-render with the
// final recipient. Staff-only — enforced at the HTTP layer.
export const sendToClient = internalMutation({
  args: {
    reportId: v.id("reportSubmissions"),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    let clientId = report.clientId ?? undefined;
    const patch: Record<string, unknown> = {};
    if (args.clientId) {
      const client = await ctx.db.get(args.clientId);
      if (!client) throw new Error("Client not found");
      clientId = args.clientId;
      // If the report was tied to a location of a different client, drop that
      // link so the recipient and the location can't contradict each other.
      if (report.siteId) {
        const site = await ctx.db.get(report.siteId);
        if (site && site.clientId !== clientId) {
          patch.siteId = undefined;
          patch.siteLabel = "";
        }
      }
    }
    if (!clientId) throw new Error("Choose a client to send this report to");

    if (report.pdfStorageId) await ctx.storage.delete(report.pdfStorageId);
    if (report.portalPdfStorageId)
      await ctx.storage.delete(report.portalPdfStorageId);

    await ctx.db.patch(args.reportId, {
      ...patch,
      clientId,
      status: "sent",
      emailedAt: Date.now(),
      pdfStorageId: undefined,
      portalPdfStorageId: undefined,
    });

    const client = await ctx.db.get(clientId);
    return {
      id: report.legacyId ?? report._id,
      status: "sent",
      clientName: client?.name ?? null,
    };
  },
});

export const generate = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.optional(v.string()),
    dateRange: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const subId = await ctx.db.insert("reportSubmissions", {
      clientId: user?.clientId,
      type: args.type ?? "generated",
      title: "Generated Report",
      summary: "Auto-generated",
      details: {},
      userId: args.userId,
      status: "submitted",
      submittedAt: Date.now(),
      deliveryPayload: {},
      siteLabel: "",
    });
    return {
      id: subId,
      message: "Report generation started",
      status: "submitted",
    };
  },
});

export const resolveId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const byLegacyId = await ctx.db
      .query("reportSubmissions")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (byLegacyId) return byLegacyId._id;
    const normalized = ctx.db.normalizeId("reportSubmissions", args.id);
    if (!normalized) return null;
    return (await ctx.db.get(normalized)) ? normalized : null;
  },
});

// Everything the PDF generator needs for one report, in one query.
export const getForPdf = internalQuery({
  args: { reportId: v.id("reportSubmissions") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    const officer = await ctx.db.get(report.userId);
    // A filed report outlives the guard who filed it; keep it attributed.
    const goneUsers = officer ? null : await deletedNamesByType(ctx, "user");
    const checkpoint = report.checkpointId
      ? await ctx.db.get(report.checkpointId)
      : null;
    const site = report.siteId
      ? await ctx.db.get(report.siteId)
      : checkpoint?.siteId
        ? await ctx.db.get(checkpoint.siteId)
        : null;
    const client = report.clientId ? await ctx.db.get(report.clientId) : null;
    return {
      id: report.legacyId ?? report._id,
      type: report.type,
      title: report.title,
      summary: report.summary,
      details: report.details,
      equipmentName: report.equipmentName ?? null,
      // API field name is stable (`evidenceUrls`): storage refs here, signed
      // into per-viewer URLs by the walker in http.ts on the way out.
      evidenceUrls: report.evidenceStorageIds ?? [],
      gpsLatitude: report.gpsLatitude ?? null,
      gpsLongitude: report.gpsLongitude ?? null,
      siteLabel: report.siteLabel,
      siteName: site?.name ?? null,
      checkpointName: checkpoint?.name ?? null,
      clientName: client?.name ?? null,
      officerName: officer?.name ?? goneUsers?.get(report.userId) ?? null,
      status: report.status,
      submittedAt: report.submittedAt,
      pdfStorageId: report.pdfStorageId ?? null,
      portalPdfStorageId: report.portalPdfStorageId ?? null,
    };
  },
});

// Lightweight access-control view: who may fetch this report's PDF.
export const getAccessInfo = internalQuery({
  args: { reportId: v.id("reportSubmissions") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    return {
      clientId: report.clientId ?? null,
      userId: report.userId,
      status: report.status,
      pdfStorageId: report.pdfStorageId ?? null,
      portalPdfStorageId: report.portalPdfStorageId ?? null,
      title: report.title,
      submittedAt: report.submittedAt,
    };
  },
});

// Ops lever: drop cached PDFs so the next download re-renders them (needed
// whenever the PDF layout/generator changes). Run with:
//   npx convex run reports:clearPdfCache
export const clearPdfCache = internalMutation({
  args: { reportId: v.optional(v.id("reportSubmissions")) },
  handler: async (ctx, args) => {
    const reports = args.reportId
      ? [await ctx.db.get(args.reportId)]
      : await ctx.db.query("reportSubmissions").collect();
    let cleared = 0;
    for (const report of reports) {
      if (!report) continue;
      if (!report.pdfStorageId && !report.portalPdfStorageId) continue;
      if (report.pdfStorageId) await ctx.storage.delete(report.pdfStorageId);
      if (report.portalPdfStorageId) await ctx.storage.delete(report.portalPdfStorageId);
      await ctx.db.patch(report._id, {
        pdfStorageId: undefined,
        portalPdfStorageId: undefined,
      });
      cleared += 1;
    }
    return { cleared };
  },
});

export const setPdfStorage = internalMutation({
  args: {
    reportId: v.id("reportSubmissions"),
    storageId: v.id("_storage"),
    variant: v.union(v.literal("staff"), v.literal("portal")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(
      args.reportId,
      args.variant === "staff"
        ? { pdfStorageId: args.storageId }
        : { portalPdfStorageId: args.storageId },
    );
  },
});

const VALID_REPORT_TYPES = ["daily-activity", "incident", "maintenance", "pass-on-log", "generated"] as const;

function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

export const submit = internalMutation({
  args: {
    type: v.string(),
    title: v.string(),
    summary: v.string(),
    details: v.any(),
    equipmentName: v.optional(v.string()),
    evidenceStorageIds: v.optional(v.array(v.string())),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    checkpointId: v.optional(v.id("checkpoints")),
    siteLabel: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (!VALID_REPORT_TYPES.includes(args.type as typeof VALID_REPORT_TYPES[number])) {
      throw new Error(
        `Invalid report type: "${args.type}". Must be one of: ${VALID_REPORT_TYPES.join(", ")}`,
      );
    }

    const title = sanitize(args.title);
    const summary = sanitize(args.summary);

    const recent = await ctx.db
      .query("reportSubmissions")
      .withIndex("by_userId_submittedAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    if (
      recent &&
      recent.status === "submitted" &&
      recent.type === args.type &&
      Date.now() - recent.submittedAt < 60_000
    ) {
      throw new Error(
        `Duplicate submission: ${args.type} report already submitted within 60 seconds`,
      );
    }

    const user = await ctx.db.get(args.userId);
    const checkpoint = args.checkpointId
      ? await ctx.db.get(args.checkpointId)
      : null;

    console.log("[REPORT_SUBMIT]", JSON.stringify({
      userId: args.userId,
      type: args.type,
      title,
    }));

    const submittedAt = Date.now();
    const id = await ctx.db.insert("reportSubmissions", {
      clientId: checkpoint?.clientId ?? user?.clientId,
      siteId: checkpoint?.siteId,
      type: args.type,
      title,
      summary,
      details: args.details,
      equipmentName: args.equipmentName,
      evidenceStorageIds: args.evidenceStorageIds,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      checkpointId: args.checkpointId,
      siteLabel: args.siteLabel ?? "",
      userId: args.userId,
      status: "submitted",
      submittedAt,
      deliveryPayload: {},
    });
    await ctx.runMutation(internal.activity.record, {
      clientId: checkpoint?.clientId ?? user?.clientId,
      siteId: checkpoint?.siteId,
      checkpointId: args.checkpointId,
      officerId: args.userId,
      activityType: args.type === "maintenance" ? "maintenance" : "dar",
      sourceTable: "reportSubmissions",
      sourceId: id,
      siteName: args.siteLabel ?? "",
      locationLabel: checkpoint?.name ?? args.siteLabel ?? "",
      activityLabel:
        args.type === "maintenance"
          ? `Maintenance request: ${title}`
          : "Daily Activity Report submitted",
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      occurredAt: submittedAt,
    });
    return id;
  },
});
