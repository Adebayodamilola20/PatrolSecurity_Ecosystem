/**
 * Minimal Sentry reporter for Convex HTTP actions.
 *
 * Convex ships an official Sentry integration, but it is gated behind the Pro
 * plan. This posts to Sentry's public envelope endpoint instead, which any plan
 * can reach, and hand-populates the tags the official integration would add
 * (route, method, deployment, request id).
 *
 * Two rules hold throughout: reporting never throws, and reporting never
 * changes a response. A monitoring backend that can take the API down with it
 * is worse than no monitoring.
 */

import { getSentryDsn, getSentryEnvironment, getSentryRelease } from "../env";

type ParsedDsn = {
  envelopeUrl: string;
  publicKey: string;
};

/** DSNs look like https://<publicKey>@<host>/<projectId>. */
function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !projectId) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

function eventId() {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    let out = "";
    for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  }
}

type Frame = {
  filename: string;
  function?: string;
  lineno?: number;
  colno?: number;
};

/**
 * Turns a V8 stack string into Sentry frames. Sentry renders frames
 * oldest-first and expects the throwing frame last, which is the reverse of how
 * V8 prints them.
 */
function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const withName = line.match(/^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)\s*$/);
    const bare = line.match(/^\s*at\s+(.+?):(\d+):(\d+)\s*$/);
    if (withName) {
      frames.push({
        function: withName[1],
        filename: withName[2],
        lineno: Number(withName[3]),
        colno: Number(withName[4]),
      });
    } else if (bare) {
      frames.push({
        filename: bare[1],
        lineno: Number(bare[2]),
        colno: Number(bare[3]),
      });
    }
  }
  return frames.reverse();
}

/** Strips credentials and signed-URL tokens out of anything we attach. */
function scrubUrl(raw: string) {
  return raw.replace(
    /([?&](token|access_token|refresh|key|sig|secret)=)[^&]*/gi,
    "$1[redacted]",
  );
}

export type ReportContext = {
  route?: string;
  method?: string;
  url?: string;
  userId?: string;
  requestId?: string;
  /** Extra tags. Keep these low-cardinality — Sentry indexes them. */
  tags?: Record<string, string>;
};

/**
 * Ships one exception to Sentry. Resolves even when reporting fails, so callers
 * can `await` it on an error path without adding a second failure mode.
 */
export async function reportException(
  error: unknown,
  context: ReportContext = {},
): Promise<void> {
  try {
    const dsn = getSentryDsn();
    if (!dsn) return;
    const parsed = parseDsn(dsn);
    if (!parsed) {
      console.error("SENTRY_DSN is set but malformed; exception reporting is off");
      return;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const frames = parseStack(err.stack);

    const event = {
      event_id: eventId(),
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      logger: "convex.http",
      environment: getSentryEnvironment(),
      ...(getSentryRelease() ? { release: getSentryRelease() } : {}),
      server_name: process.env.CONVEX_CLOUD_URL ?? "convex",
      transaction: context.route
        ? `${context.method ?? "?"} ${context.route}`
        : undefined,
      tags: {
        runtime: "convex",
        ...(context.route ? { route: context.route } : {}),
        ...(context.method ? { method: context.method } : {}),
        ...(context.tags ?? {}),
      },
      // Sentry only accepts an id/username/email here, and only the opaque
      // Convex id goes in. Names, emails and phone numbers stay out of Sentry
      // entirely -- this is a security contractor's staff data.
      ...(context.userId ? { user: { id: context.userId } } : {}),
      extra: {
        ...(context.url ? { url: scrubUrl(context.url) } : {}),
        ...(context.requestId ? { requestId: context.requestId } : {}),
      },
      exception: {
        values: [
          {
            type: err.name || "Error",
            value: err.message,
            ...(frames.length ? { stacktrace: { frames } } : {}),
          },
        ],
      },
    };

    const envelope = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");

    // A slow or unreachable Sentry must not hold a request open. The response
    // is already an error by the time we get here; two seconds is the cap.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2000);
    try {
      await fetch(parsed.envelopeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=patrol-convex/1.0, sentry_key=${parsed.publicKey}`,
        },
        body: envelope,
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (reportingError) {
    // Last line of defence: the original error still propagates to the caller
    // and to the Convex logs, we simply failed to forward it.
    console.error("failed to report exception to Sentry:", reportingError);
  }
}
