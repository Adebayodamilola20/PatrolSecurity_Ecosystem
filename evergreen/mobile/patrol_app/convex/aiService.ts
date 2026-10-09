import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NVIDIA_CHAT_MODEL = process.env.NVIDIA_CHAT_MODEL || "openai/gpt-oss-120b";
const NVIDIA_EMBEDDING_MODEL = process.env.NVIDIA_EMBEDDING_MODEL || "nvidia/nv-embedqa-e5-v5";

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

function getNvidiaKey() {
  return process.env.NVIDIA_API_KEY?.trim() || "";
}

function inferIntent(question: string): string {
  const q = question.toLowerCase();
  if (/\b(report|dar|summary|email|client update|monthly|weekly)\b/.test(q)) return "report";
  if (/\b(policy|sop|procedure|training|post order|instruction|template)\b/.test(q)) return "knowledge";
  if (/\b(clock|timesheet|hours|late|overtime|attendance|on duty|clocked)\b/.test(q)) return "timesheet";
  if (/\b(scan|patrol|checkpoint|missed)\b/.test(q)) return "patrol";
  if (/\b(geofence|gps|location|radius|outside)\b/.test(q)) return "geofence";
  if (/\b(pass.?on|handover|handoff)\b/.test(q)) return "handover";
  if (/\b(alert|risk|emergency|inactivity|suspicious)\b/.test(q)) return "risk";
  return "operations";
}

function reportTypeFromQuestion(question: string): string {
  const q = question.toLowerCase();
  const exact = REPORT_TYPES.find((type) => q.includes(type.toLowerCase().replace(/\s*\/\s*/g, " ")));
  if (exact) return exact;
  if (q.includes("weekly")) return "Weekly Report";
  if (q.includes("monthly")) return "Monthly Report";
  if (q.includes("incident")) return "Incident Report";
  if (q.includes("attendance")) return "Attendance Report";
  if (q.includes("clock")) return "Clock-In / Clock-Out Report";
  if (q.includes("pass")) return "Pass-On Log Report";
  if (q.includes("client")) return "Client Summary Report";
  return "Daily Activity Report";
}

function buildSystemPrompt(role: string): string {
  return `You are the AI Operations Assistant for Evergreen / Patrol Security.
Speak like a professional control-room assistant advising a supervisor.
Only answer from the verified JSON data and retrieved document context provided in this request.
Never invent patrol scans, guard names, clock-in times, incident reports, GPS data, locations, clients, or policies.
If the verified data does not answer the question, say exactly what is missing and ask for a narrower date, guard, site, or report type.
Respect access control. The caller role is ${role}. Do not expose phone numbers or emails unless they are present in the verified data.
Keep answers concise, natural, and operationally useful.
Do NOT use any markdown formatting. Do NOT use asterisks, bold, italic, bullet points, numbered lists, or any special formatting. Use plain unformatted text only.
For reports, use a simple plain text format with clear sections and a short operational summary.`;
}

export const callNvidiaChat = internalAction({
  args: {
    messages: v.array(v.object({
      role: v.string(),
      content: v.string(),
    })),
    temperature: v.optional(v.number()),
    topP: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const key = getNvidiaKey();
    if (!key) {
      return {
        unavailable: true,
        content: "The AI assistant is not available yet because the NVIDIA API key has not been configured.",
        model: NVIDIA_CHAT_MODEL,
      };
    }

    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: NVIDIA_CHAT_MODEL,
        messages: args.messages,
        temperature: args.temperature ?? 1,
        top_p: args.topP ?? 1,
        max_tokens: args.maxTokens ?? 4096,
        stream: false,
      }),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => "");
      throw new Error(`NVIDIA chat API error ${res.status}${details ? `: ${details.slice(0, 240)}` : ""}`);
    }

    const data = await res.json();
    return {
      content: data?.choices?.[0]?.message?.content || "",
      reasoning: data?.choices?.[0]?.message?.reasoning_content || null,
      model: data?.model || NVIDIA_CHAT_MODEL,
      usage: data?.usage || null,
    };
  },
});

export const checkRateLimit = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const minuteKey = `minute:${new Date().toISOString().slice(0, 16)}`;
    const dayKey = `day:${new Date().toISOString().slice(0, 10)}`;
    const limits = [
      { key: minuteKey, max: Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 8) },
      { key: dayKey, max: Number(process.env.AI_RATE_LIMIT_PER_DAY || 120) },
    ];

    for (const limit of limits) {
      const existing = await ctx.db.query("aiRateLimits")
        .withIndex("by_userId_windowKey", (q) =>
          q.eq("userId", args.userId).eq("windowKey", limit.key),
        )
        .first();

      const count = existing?.count ?? 0;
      if (count >= limit.max) {
        const err: any = new Error("AI usage limit reached. Please wait before asking another question.");
        err.status = 429;
        throw err;
      }

      if (existing) {
        await ctx.db.patch(existing._id, { count: count + 1, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("aiRateLimits", {
          userId: args.userId,
          windowKey: limit.key,
          count: 1,
          updatedAt: Date.now(),
        });
      }
    }
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
    error: v.string(),
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
      error: args.error,
      createdAt: Date.now(),
    });
  },
});

export const saveReport = internalMutation({
  args: {
    userId: v.id("users"),
    reportType: v.string(),
    content: v.string(),
    sourceSummary: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("aiGeneratedReports", {
      userId: args.userId,
      reportType: args.reportType,
      title: `${args.reportType} - ${new Date().toLocaleDateString()}`,
      content: args.content,
      sourceSummary: args.sourceSummary,
      status: "draft",
      createdAt: Date.now(),
    });
  },
});

export const listReports = internalQuery({
  args: {
    userId: v.id("users"),
    userRole: v.string(),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    if (args.userRole === "admin") {
      return await ctx.db.query("aiGeneratedReports")
        .order("desc")
        .take(50);
    }
    return await ctx.db.query("aiGeneratedReports")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
  },
});

function parseDate(val: any): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return Date.parse(val);
  return 0;
}

async function gatherContext(ctx: any, userId: string, userRole: string, clientId: string | undefined, intent: string) {
  const sinceToday = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const sinceWeek = Date.now() - 7 * 86400000;
  const sources: string[] = [];
  const context: Record<string, any> = {};

  const scans = await ctx.runQuery(internal.scans.listForApi, {
    officerId: userRole === "guard" ? userId : undefined,
    clientId: clientId ?? undefined,
    limit: 200,
  });
  const recentScans = scans.filter((s: any) => parseDate(s.scannedAt) >= sinceWeek);
  context.recentScans = recentScans.slice(0, 80);
  sources.push("recent patrol scans");

  const shifts = await ctx.runQuery(internal.shifts.listAll, {
    userId: userRole === "guard" ? userId : undefined,
    clientId: clientId ?? undefined,
  });
  const recentShifts = shifts.filter((s: any) => parseDate(s.clockIn) >= sinceWeek);
  const safeShifts = recentShifts.map((shift: any) => {
    if (userRole === "admin" || userRole === "main_account" || shift.userId === userId) return shift;
    const { userEmail, userPhone, ...rest } = shift;
    return rest;
  });
  context.recentShifts = safeShifts.slice(0, 80);
  context.activeShifts = safeShifts.filter((s: any) => s.status === "active");
  sources.push("clock-in and timesheet records");

  const incidents = await ctx.runQuery(internal.incidents.listForApi, {
    officerId: userRole === "guard" ? userId : undefined,
    clientId: clientId ?? undefined,
  });
  context.recentIncidents = incidents.filter((i: any) => parseDate(i.reportedAt) >= sinceWeek).slice(0, 50);
  sources.push("incident reports");

  const passOnLogs = await ctx.runQuery(internal.passOnLogs.listForUser, { userId });
  context.passOnLogs = passOnLogs.filter((p: any) => parseDate(p.createdAt) >= sinceWeek).slice(0, 40);
  sources.push("pass-on logs");

  const handovers = await ctx.runQuery(internal.handovers.listAll, {
    clientId: clientId ?? undefined,
  });
  context.handovers = handovers.filter((h: any) => parseDate(h.createdAt) >= sinceWeek).slice(0, 40);
  sources.push("handovers");

  if (intent === "operations" || intent === "risk" || intent === "report") {
    const checkpoints = await ctx.runQuery(internal.checkpoints.listForApi, {
      clientId: userRole === "admin" ? undefined : clientId,
    });
    context.checkpoints = checkpoints.filter((c: any) => c.active !== false).slice(0, 120);
    sources.push("checkpoint and site records");
  }

  context.today = {
    startedAt: sinceToday,
    scans: context.recentScans.filter((s: any) => parseDate(s.scannedAt) >= sinceToday).length,
    activeGuards: context.activeShifts.length,
    incidents: context.recentIncidents.filter((i: any) => parseDate(i.reportedAt) >= sinceToday).length,
  };

  return { context, sources };
}

export const chat = internalAction({
  args: {
    userId: v.id("users"),
    userRole: v.string(),
    clientId: v.optional(v.string()),
    question: v.string(),
    history: v.optional(v.array(v.object({
      role: v.string(),
      content: v.string(),
    }))),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    answer: string;
    intent: string;
    model: string | null;
    assistantUnavailable: boolean;
    generatedReportId: string | null;
    sources: string[];
  }> => {
    const question = args.question.trim();
    if (!question) {
      return { answer: "Please provide a question.", intent: "unknown", model: null, assistantUnavailable: false, generatedReportId: null, sources: [] };
    }

    const intent = inferIntent(question);
    const sensitive = /\b(phone|email|contact|number|address)\b/i.test(question);
    const history = (args.history ?? []).filter(
      (item) => ["user", "assistant"].includes(item.role) && typeof item.content === "string",
    ).slice(-8);

    await ctx.runMutation(internal.aiService.checkRateLimit, { userId: args.userId });

    const { context, sources } = await gatherContext(ctx, args.userId, args.userRole, args.clientId ?? undefined, intent);

    const messages = [
      { role: "system" as const, content: buildSystemPrompt(args.userRole) },
      ...history.map((item) => ({ role: item.role as "user" | "assistant", content: item.content.slice(0, 1200) })),
      {
        role: "user" as const,
        content: JSON.stringify({
          question,
          intent,
          verifiedOperationalData: context,
          requiredReportTypes: REPORT_TYPES,
        }),
      },
    ];

    let result: any;
    try {
      result = await ctx.runAction(internal.aiService.callNvidiaChat, { messages, maxTokens: 4096 });
    } catch (error: any) {
      result = { content: "I found verified records for this request, but the AI provider did not return a usable response. Please try again in a moment.", error };
    }

    const answer = result.unavailable
      ? "The AI assistant is temporarily unavailable because the NVIDIA key is not configured on the server."
      : (result.content || "I found verified records for this request, but the AI provider did not return a usable response.");

    let generatedReportId: string | null = null;
    if (intent === "report" && !result.unavailable && answer) {
      generatedReportId = await ctx.runMutation(internal.aiService.saveReport, {
        userId: args.userId,
        reportType: reportTypeFromQuestion(question),
        content: answer,
        sourceSummary: JSON.stringify({ sources }),
      });
    }

    const dataSources = sources.length ? sources : ["operational database"];
    await ctx.runMutation(internal.aiService.recordAudit, {
      userId: args.userId,
      userRole: args.userRole,
      question,
      intent,
      dataSources,
      sensitive,
      status: result.error ? "provider_error" : "completed",
      error: result.error?.message || "",
    }).catch(() => {});

    return {
      answer,
      intent,
      model: result.model || null,
      assistantUnavailable: !!result.unavailable,
      generatedReportId,
      sources: dataSources,
    };
  },
});
