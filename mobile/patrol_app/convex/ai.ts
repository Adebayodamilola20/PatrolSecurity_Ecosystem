import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const requesterValidator = v.object({
  userId: v.id("users"),
  role: v.string(),
  clientId: v.optional(v.id("clients")),
  siteIds: v.array(v.id("sites")),
});

function iso(value: number | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function uniqueIds<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchTokens(value: string) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function textMatchesQuestion(text: string, question: string) {
  const haystack = normalizeSearchText(text);
  const tokens = searchTokens(question);
  return tokens.some((token) => haystack.includes(token) || token.includes(haystack));
}

function isScopedToRequester(
  requester: { userId: Id<"users">; role: string; clientId?: Id<"clients">; siteIds: Id<"sites">[] },
  item: { userId?: Id<"users">; clientId?: Id<"clients">; siteId?: Id<"sites"> },
) {
  if (requester.role === "admin") return true;
  if (requester.role === "main_account") return !!requester.clientId && item.clientId === requester.clientId;
  if (requester.role === "guard") return item.userId === requester.userId;
  return !!item.siteId && requester.siteIds.includes(item.siteId);
}

function canSeeContactDetails(
  requester: { userId: Id<"users">; role: string },
  guardId: Id<"users">,
) {
  return (
    requester.role === "admin" ||
    requester.role === "main_account" ||
    requester.role === "supervisor" ||
    requester.userId === guardId
  );
}

export const getOperationalSnapshot = internalQuery({
  args: {
    requester: requesterValidator,
    question: v.string(),
  },
  handler: async (ctx, args) => {
    const todayStart = startOfToday();
    const requester = args.requester;

    const guardsQuery =
      requester.role === "main_account" && requester.clientId
        ? ctx.db
            .query("users")
            .withIndex("by_role_clientId", (q) =>
              q.eq("role", "guard").eq("clientId", requester.clientId),
            )
        : ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "guard"));

    let guards = await guardsQuery.take(500);

    if (requester.role === "supervisor") {
      // Supervisors are scoped by site, but a user row carries no siteId —
      // guards reach sites through userSiteAssignments — so the generic check
      // can never match one and would drop every guard. Scope by assignment
      // instead: a supervisor sees the guards posted to the sites they cover.
      const scopedGuardIds = new Set<Id<"users">>();
      for (const siteId of requester.siteIds) {
        const assignments = await ctx.db
          .query("userSiteAssignments")
          .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
          .take(200);
        for (const assignment of assignments) scopedGuardIds.add(assignment.userId);
      }
      // A supervisor with no sites still sees nobody. The clientId check is
      // belt-and-braces against a site assigned across tenants; guards
      // predating clients carry no clientId, so only a mismatch excludes.
      guards = guards.filter(
        (guard) =>
          scopedGuardIds.has(guard._id) &&
          (!requester.clientId ||
            !guard.clientId ||
            guard.clientId === requester.clientId),
      );
    } else {
      guards = guards.filter((guard) =>
        isScopedToRequester(requester, {
          userId: guard._id,
          clientId: guard.clientId,
        }),
      );
    }

    const guardIds = new Set(guards.map((guard) => guard._id));

    const requesterClientId = requester.clientId;
    let scopedSites =
      requester.role === "main_account" && requesterClientId
        ? await ctx.db
            .query("sites")
            .withIndex("by_clientId", (q) => q.eq("clientId", requesterClientId))
            .take(500)
        : await ctx.db.query("sites").take(500);
    scopedSites = scopedSites.filter((site) =>
      requester.role === "admin" ||
      (requester.role === "main_account" && site.clientId === requester.clientId) ||
      requester.siteIds.includes(site._id),
    );

    const allAssignments = [];
    for (const guard of guards) {
      const assignments = await ctx.db
        .query("userSiteAssignments")
        .withIndex("by_userId", (q) => q.eq("userId", guard._id))
        .take(20);
      allAssignments.push(...assignments);
    }

    const siteIds = uniqueIds(allAssignments.map((assignment) => assignment.siteId));
    const sitesById = new Map<Id<"sites">, { id: Id<"sites">; name: string; location: string; active: boolean }>();
    for (const site of scopedSites) {
      sitesById.set(site._id, {
        id: site._id,
        name: site.name,
        location: site.location,
        active: site.active,
      });
    }
    for (const siteId of siteIds) {
      if (sitesById.has(siteId)) continue;
      const site = await ctx.db.get(siteId);
      if (site) sitesById.set(site._id, { id: site._id, name: site.name, location: site.location, active: site.active });
    }

    const activeShiftRows = await ctx.db
      .query("shifts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(300);
    const activeShifts = activeShiftRows.filter((shift) =>
      guardIds.has(shift.userId) &&
      isScopedToRequester(requester, {
        userId: shift.userId,
        clientId: shift.clientId,
        siteId: shift.siteId,
      }),
    );

    const todayScansRaw = await ctx.db
      .query("scans")
      .withIndex("by_scannedAt")
      .order("desc")
      .take(500);
    const todayScans = todayScansRaw.filter((scan) =>
      scan.scannedAt >= todayStart &&
      guardIds.has(scan.officerId) &&
      isScopedToRequester(requester, {
        userId: scan.officerId,
        clientId: scan.clientId,
        siteId: scan.siteId,
      }),
    );

    const recentScansRaw = await ctx.db
      .query("scans")
      .withIndex("by_scannedAt")
      .order("desc")
      .take(500);
    const recentScans = recentScansRaw.filter((scan) =>
      guardIds.has(scan.officerId) &&
      isScopedToRequester(requester, {
        userId: scan.officerId,
        clientId: scan.clientId,
        siteId: scan.siteId,
      }),
    );

    const shiftsTodayRaw = await ctx.db
      .query("shifts")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .take(500);
    const completedShiftsToday = shiftsTodayRaw.filter((shift) =>
      shift.clockIn >= todayStart &&
      guardIds.has(shift.userId) &&
      isScopedToRequester(requester, {
        userId: shift.userId,
        clientId: shift.clientId,
        siteId: shift.siteId,
      }),
    );

    const recentShiftRows = await ctx.db.query("shifts").order("desc").take(500);
    const recentShifts = recentShiftRows.filter((shift) =>
      guardIds.has(shift.userId) &&
      isScopedToRequester(requester, {
        userId: shift.userId,
        clientId: shift.clientId,
        siteId: shift.siteId,
      }),
    );

    const recentIncidentsRaw = await ctx.db
      .query("incidents")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(200);
    const recentIncidents = recentIncidentsRaw.filter((incident) =>
      isScopedToRequester(requester, {
        userId: incident.officerId,
        clientId: incident.clientId,
        siteId: incident.siteId,
      }),
    );

    const passOnLogsRaw = await ctx.db
      .query("passOnLogs")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(200);
    const passOnLogs = passOnLogsRaw.filter((log) =>
      isScopedToRequester(requester, {
        userId: log.createdBy,
        clientId: log.clientId,
        siteId: log.siteId,
      }),
    );

    const handoversRaw = await ctx.db
      .query("handovers")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(200);
    const handovers = handoversRaw.filter((handover) =>
      isScopedToRequester(requester, {
        userId: handover.fromUserId,
        clientId: handover.clientId,
        siteId: handover.siteId,
      }),
    );

    const questionSiteMatches = scopedSites
      .filter((site) => textMatchesQuestion(`${site.name} ${site.location}`, args.question))
      .map((site) => ({
        id: site.legacyId ?? site._id,
        convexId: site._id,
        name: site.name,
        location: site.location,
        active: site.active,
      }))
      .slice(0, 10);

    const checkpointsRaw = await ctx.db.query("checkpoints").take(1000);
    const checkpoints = checkpointsRaw.filter((checkpoint) =>
      isScopedToRequester(requester, {
        clientId: checkpoint.clientId,
        siteId: checkpoint.siteId,
      }),
    );
    const questionCheckpointMatches = checkpoints
      .filter((checkpoint) => textMatchesQuestion(`${checkpoint.name} ${checkpoint.code}`, args.question))
      .map((checkpoint) => {
        const site = checkpoint.siteId ? sitesById.get(checkpoint.siteId) : null;
        return {
          id: checkpoint.legacyId ?? checkpoint._id,
          convexId: checkpoint._id,
          name: checkpoint.name,
          code: checkpoint.code,
          siteId: checkpoint.siteId ?? null,
          siteName: site?.name ?? "",
          active: checkpoint.active,
        };
      })
      .slice(0, 10);

    const guardSummaries = [];
    for (const guard of guards) {
      const assignments = allAssignments.filter((assignment) => assignment.userId === guard._id);
      const assignedSites = assignments.map((assignment) => {
        const site = sitesById.get(assignment.siteId);
        return {
          id: assignment.siteId,
          name: site?.name ?? "Unknown site",
          location: site?.location ?? "",
          active: site?.active ?? false,
        };
      });
      const activeShift = activeShifts.find((shift) => shift.userId === guard._id);
      const lastScan = todayScans.find((scan) => scan.officerId === guard._id);
      guardSummaries.push({
        id: guard.legacyId ?? guard._id,
        convexId: guard._id,
        name: guard.name,
        role: guard.role,
        phone: canSeeContactDetails(requester, guard._id) ? guard.phone : null,
        email: canSeeContactDetails(requester, guard._id) ? guard.email : null,
        activeProfile: guard.active,
        assignedSites,
        assignedSiteCount: assignedSites.length,
        currentlyClockedIn: !!activeShift,
        currentlyOnDuty: !!activeShift && guard.active,
        currentShift: activeShift
          ? {
              id: activeShift.legacyId ?? activeShift._id,
              clockIn: iso(activeShift.clockIn),
              clockOut: iso(activeShift.clockOut),
              status: activeShift.status,
              siteId: activeShift.siteId ?? null,
              siteName:
                (activeShift.siteId ? sitesById.get(activeShift.siteId)?.name : null) ??
                activeShift.siteLabel ??
                "Unknown site",
              siteLabel: activeShift.siteLabel,
            }
          : null,
        patrolScansToday: todayScans.filter((scan) => scan.officerId === guard._id).length,
        lastActivity: lastScan
          ? {
              type: "patrol_scan",
              at: iso(lastScan.scannedAt),
              gpsValid: lastScan.gpsValid,
              distanceMeters: lastScan.distanceMeters ?? null,
            }
          : activeShift
            ? {
                type: "clock_in",
                at: iso(activeShift.clockIn),
                gpsValid: null,
                distanceMeters: null,
              }
            : null,
      });
    }

    return {
      checkedAt: new Date().toISOString(),
      scope: {
        requesterRole: requester.role,
        requesterUserId: requester.userId,
        requesterClientId: requester.clientId ?? null,
        requesterSiteIds: requester.siteIds,
      },
      counts: {
        totalGuardsRegistered: guards.length,
        activeGuardProfiles: guards.filter((guard) => guard.active).length,
        guardsAssignedToSites: guardSummaries.filter((guard) => guard.assignedSiteCount > 0).length,
        guardsCurrentlyClockedIn: guardSummaries.filter((guard) => guard.currentlyClockedIn).length,
        guardsCurrentlyOnDuty: guardSummaries.filter((guard) => guard.currentlyOnDuty).length,
        guardsWithPatrolScansToday: guardSummaries.filter((guard) => guard.patrolScansToday > 0).length,
        activeShiftRecords: activeShifts.length,
        completedShiftRecordsToday: completedShiftsToday.length,
        patrolScansToday: todayScans.length,
        scopedSites: scopedSites.length,
        recentScans: recentScans.length,
        recentShifts: recentShifts.length,
        openIncidents: recentIncidents.length,
        activePassOnLogs: passOnLogs.length,
        pendingHandovers: handovers.length,
        totalCheckpoints: checkpoints.length,
        activeCheckpoints: checkpoints.filter((checkpoint) => checkpoint.active).length,
        inactiveCheckpoints: checkpoints.filter((checkpoint) => !checkpoint.active).length,
      },
      guards: guardSummaries,
      activeGuards: guardSummaries.filter((guard) => guard.currentlyOnDuty),
      sites: scopedSites.map((site) => ({
        id: site.legacyId ?? site._id,
        convexId: site._id,
        name: site.name,
        location: site.location,
        active: site.active,
        clientId: site.clientId,
      })),
      questionMatches: {
        sites: questionSiteMatches,
        checkpoints: questionCheckpointMatches,
      },
      checkpoints: checkpoints.map((checkpoint) => {
        const site = checkpoint.siteId ? sitesById.get(checkpoint.siteId) : null;
        return {
          id: checkpoint.legacyId ?? checkpoint._id,
          convexId: checkpoint._id,
          name: checkpoint.name,
          code: checkpoint.code,
          siteId: checkpoint.siteId ?? null,
          siteName: site?.name ?? "",
          active: checkpoint.active,
          radiusMeters: checkpoint.radiusMeters,
          expectedIntervalMinutes: checkpoint.expectedIntervalMinutes,
        };
      }),
      recentScans: recentScans.slice(0, 80).map((scan) => {
        const site = scan.siteId ? sitesById.get(scan.siteId) : null;
        return {
          id: scan.legacyId ?? scan._id,
          officerId: scan.officerId,
          officerName: guards.find((guard) => guard._id === scan.officerId)?.name ?? "",
          siteId: scan.siteId ?? null,
          siteName: site?.name ?? "",
          checkpointId: scan.checkpointId,
          scannedAt: iso(scan.scannedAt),
          gpsValid: scan.gpsValid,
          distanceMeters: scan.distanceMeters ?? null,
          notes: scan.notes,
        };
      }),
      recentShifts: recentShifts.slice(0, 80).map((shift) => {
        const site = shift.siteId ? sitesById.get(shift.siteId) : null;
        return {
          id: shift.legacyId ?? shift._id,
          guardName: guards.find((guard) => guard._id === shift.userId)?.name ?? "",
          userId: shift.userId,
          siteId: shift.siteId ?? null,
          siteName: site?.name ?? shift.siteLabel ?? "",
          status: shift.status,
          clockIn: iso(shift.clockIn),
          clockOut: iso(shift.clockOut),
        };
      }),
      incidents: recentIncidents.map((incident) => ({
        id: incident.legacyId ?? incident._id,
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        status: incident.status,
        reportedAt: iso(incident.reportedAt),
        siteId: incident.siteId ?? null,
      })),
      passOnLogs: passOnLogs.map((log) => ({
        id: log.legacyId ?? log._id,
        title: log.title,
        instruction: log.instruction,
        priority: log.priority,
        siteLabel: log.siteLabel,
        siteId: log.siteId ?? null,
        active: log.active,
        createdAt: iso(log.createdAt),
      })),
      handovers: handovers.map((handover) => ({
        id: handover.legacyId ?? handover._id,
        siteLabel: handover.siteLabel,
        summary: handover.summary,
        openIssues: handover.openIssues,
        equipmentStatus: handover.equipmentStatus,
        status: handover.status,
        siteId: handover.siteId ?? null,
        createdAt: iso(handover.createdAt),
      })),
      dataValidation: {
        tablesChecked: [
          "users",
          "userSiteAssignments",
          "sites",
          "shifts",
          "scans",
          "checkpoints",
          "incidents",
          "passOnLogs",
          "handovers",
        ],
        missingData: [
          ...(guards.length === 0 ? ["No guard user records matched this user's access scope."] : []),
          ...(activeShifts.length > 0 && guards.length === 0
            ? ["Active shifts exist but no scoped guard profiles matched them."]
            : []),
          ...guardSummaries
            .filter((guard) => guard.currentlyOnDuty && !guard.currentShift?.siteName)
            .map((guard) => `Active guard ${guard.name} is missing a resolved site name.`),
        ],
      },
    };
  },
});

export const recordAudit = internalMutation({
  args: {
    userId: v.id("users"),
    userRole: v.string(),
    question: v.string(),
    intent: v.string(),
    dataSources: v.array(v.string()),
    sensitive: v.boolean(),
    status: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiAuditLogs", {
      userId: args.userId,
      userRole: args.userRole,
      question: args.question,
      intent: args.intent,
      dataSources: args.dataSources,
      sensitive: args.sensitive,
      status: args.status,
      error: args.error ?? "",
      createdAt: Date.now(),
    });
  },
});

export const checkAndIncrementRateLimit = internalMutation({
  args: {
    userId: v.id("users"),
    perMinute: v.number(),
    perDay: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const windows = [
      { key: `minute:${now.toISOString().slice(0, 16)}`, max: args.perMinute },
      { key: `day:${now.toISOString().slice(0, 10)}`, max: args.perDay },
    ];

    for (const window of windows) {
      const existing = await ctx.db
        .query("aiRateLimits")
        .withIndex("by_userId_windowKey", (q) =>
          q.eq("userId", args.userId).eq("windowKey", window.key),
        )
        .unique();
      if (existing && existing.count >= window.max) {
        return { allowed: false, reason: "AI usage limit reached. Please wait before asking another question." };
      }
    }

    for (const window of windows) {
      const existing = await ctx.db
        .query("aiRateLimits")
        .withIndex("by_userId_windowKey", (q) =>
          q.eq("userId", args.userId).eq("windowKey", window.key),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          count: existing.count + 1,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("aiRateLimits", {
          userId: args.userId,
          windowKey: window.key,
          count: 1,
          updatedAt: Date.now(),
        });
      }
    }

    return { allowed: true, reason: "" };
  },
});

export const saveGeneratedReport = internalMutation({
  args: {
    userId: v.id("users"),
    reportType: v.string(),
    title: v.string(),
    content: v.string(),
    sourceSummary: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("aiGeneratedReports", {
      userId: args.userId,
      reportType: args.reportType,
      title: args.title,
      content: args.content,
      sourceSummary: args.sourceSummary,
      status: "draft",
      createdAt: Date.now(),
    });
  },
});

export const listGeneratedReports = internalQuery({
  args: {
    requester: requesterValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reports = await ctx.db
      .query("aiGeneratedReports")
      .withIndex("by_createdAt")
      .order("desc")
      .take(args.limit ?? 30);

    return reports
      .filter((report) => args.requester.role === "admin" || report.userId === args.requester.userId)
      .map((report) => ({
        id: report._id,
        reportType: report.reportType,
        title: report.title,
        content: report.content,
        sourceSummary: report.sourceSummary,
        status: report.status,
        createdAt: iso(report.createdAt),
      }));
  },
});
