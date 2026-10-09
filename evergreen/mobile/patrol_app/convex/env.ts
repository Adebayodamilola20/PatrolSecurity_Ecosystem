function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required but not configured`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue = ""): string {
  return process.env[name]?.trim() || defaultValue;
}

export function getResendApiKey() {
  return requireEnv("RESEND_API_KEY");
}

export function getResendFromEmail() {
  return requireEnv("RESEND_FROM_EMAIL");
}

export function getTermiiApiKey() {
  return requireEnv("TERMII_API_KEY");
}

export function getTermiiSenderId() {
  return requireEnv("TERMII_SENDER_ID");
}

export function getTermiiBaseUrl() {
  // Termii's current host. The old api.ng.termii.com default is stale, and a
  // deployment that inherits it loses SMS silently rather than loudly.
  return optionalEnv("TERMII_BASE_URL", "https://v3.api.termii.com/api");
}

export function getJwtSecret() {
  return requireEnv("PATROL_JWT_SECRET");
}

export function getConvexUrl() {
  return requireEnv("CONVEX_URL");
}

/**
 * Public origin of the HTTP action router. Convex injects CONVEX_SITE_URL into
 * every deployment, so this needs no manual configuration.
 */
export function getConvexSiteUrl() {
  return requireEnv("CONVEX_SITE_URL");
}

/**
 * Every HTTP route is mounted under this prefix.
 *
 * MUST match `httpPrefix` in convex/convex.config.ts. Route declarations in
 * http.ts are written without it and Convex prepends it at mount time, so a URL
 * built from CONVEX_SITE_URL alone points at nothing.
 */
export const HTTP_PREFIX = "/api/v1";

/** Absolute base URL for links back into this API (e.g. signed photo URLs). */
export function getApiBaseUrl() {
  return `${getConvexSiteUrl()}${HTTP_PREFIX}`;
}

function positiveNumberEnv(name: string, defaultValue: number): number {
  const parsed = Number(process.env[name]?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * How long a guard's GPS breadcrumb trail is kept before the daily cleanup cron
 * deletes it. Live tracking and recent history are what the product needs; an
 * unbounded trail is the single fastest-growing table in the system.
 */
export function getPositionRetentionDays() {
  return positiveNumberEnv("GPS_POSITION_RETENTION_DAYS", 30);
}

/**
 * Movement gate for GPS breadcrumbs. A guard standing at a post would otherwise
 * write an identical row every 30s; a position is only stored once they have
 * moved this far, or once this long has passed (so a stationary guard still
 * produces a periodic proof-of-presence heartbeat).
 */
export function getPositionMinDistanceMeters() {
  return positiveNumberEnv("GPS_MIN_DISTANCE_METERS", 20);
}

export function getPositionMaxIntervalMs() {
  return positiveNumberEnv("GPS_MAX_INTERVAL_MINUTES", 5) * 60 * 1000;
}

/**
 * How long an uploaded-but-never-attached blob survives before the orphan
 * sweeper removes it. Covers the phone dying between upload and submit.
 */
export function getOrphanUploadTtlMs() {
  return positiveNumberEnv("UPLOAD_ORPHAN_TTL_HOURS", 24) * 60 * 60 * 1000;
}

/**
 * Lifetime of a signed photo/file URL handed to an authorized client.
 *
 * 10 minutes: long enough for a slow mobile connection to open an evidence
 * gallery, short enough that a URL leaked from a screenshot or chat log dies
 * before it is useful. The viewer re-fetching the list mints fresh URLs, so a
 * shorter TTL costs users nothing. Override with PHOTO_URL_TTL_SECONDS.
 */
export function getPhotoUrlTtlSeconds() {
  return positiveNumberEnv("PHOTO_URL_TTL_SECONDS", 600);
}

/**
 * Sentry DSN for backend exception reporting.
 *
 * Deliberately optional: Convex's own Sentry integration is a Pro-plan feature,
 * so lib/sentry.ts posts to the ingest API directly instead. Leaving this unset
 * disables reporting entirely rather than failing a deployment.
 */
export function getSentryDsn() {
  return optionalEnv("SENTRY_DSN");
}

export function getSentryEnvironment() {
  return optionalEnv("SENTRY_ENVIRONMENT", process.env.CONVEX_DEPLOYMENT || "unknown");
}

export function getSentryRelease() {
  return optionalEnv("SENTRY_RELEASE");
}

export function validateEnv() {
  getResendApiKey();
  getResendFromEmail();
  getTermiiApiKey();
  getTermiiSenderId();
  getJwtSecret();
  getConvexUrl();
}

/**
 * Which deployment this is.
 *
 * Convex sets CONVEX_DEPLOYMENT to `<type>:<name>` — `prod:harmless-pigeon-186`,
 * `dev:resilient-buffalo-226` — never to a bare word. Comparing the whole value
 * against "production" and "dev", as this did, produced three flags that were
 * false everywhere including the environments they name.
 *
 * Nothing read them, so nothing was broken by it. The hazard was the next
 * person to write `if (DEPLOYMENT.isProduction)` around a guard and get silence
 * instead of enforcement. Parse the prefix, and treat an unrecognised value as
 * production: an environment we cannot identify is the wrong one to relax in.
 */
function deploymentType(): string {
  const raw = process.env.CONVEX_DEPLOYMENT?.trim() ?? "";
  const [type] = raw.split(":");
  return (type || "").toLowerCase();
}

const DEPLOYMENT_TYPE = deploymentType();

export const DEPLOYMENT = {
  isDevelopment: DEPLOYMENT_TYPE === "dev" || DEPLOYMENT_TYPE === "local",
  isPreview: DEPLOYMENT_TYPE === "preview",
  isProduction:
    DEPLOYMENT_TYPE === "prod" ||
    DEPLOYMENT_TYPE === "production" ||
    // Fail safe: unknown or unset means assume production.
    !["dev", "local", "preview"].includes(DEPLOYMENT_TYPE),
};
