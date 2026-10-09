export function errorResponse(
  message: string,
  status: number,
  details?: string,
  extraHeaders?: Record<string, string>,
) {
  // Error responses need the same CORS headers as success responses, or the
  // browser blocks the cross-origin read and the fetch rejects with a generic
  // "Load failed" instead of surfacing our message (409 conflicts, 4xx, etc.).
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // So a browser can actually read Retry-After off a cross-origin 429/503.
  headers.set("Access-Control-Expose-Headers", "Retry-After");
  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    headers.set(key, value);
  }
  return Response.json(
    { message, ...(details ? { details } : {}), timestamp: new Date().toISOString() },
    { status, headers },
  );
}

function retryAfterHeader(retryAfterMs?: number): Record<string, string> {
  if (!retryAfterMs || retryAfterMs <= 0) return {};
  // HTTP Retry-After is in whole seconds; round up so we never tell a client
  // to retry before the window has actually cleared.
  return { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) };
}

export function badRequest(message: string) {
  return errorResponse(message, 400);
}

export function unauthorized(message = "Unauthorized") {
  return errorResponse(message, 401);
}

export function forbidden(message = "Access denied") {
  return errorResponse(message, 403);
}

export function notFound(message = "Not found") {
  return errorResponse(message, 404);
}

export function conflict(message = "Conflict") {
  return errorResponse(message, 409);
}

// 410 for a location the company has removed from service. Distinct from 404
// ("we don't recognise this QR at all") so the app can tell a guard standing at
// a decommissioned site to call the office, instead of telling them to retry a
// scan that can never succeed.
export function gone(message = "No longer available") {
  return errorResponse(message, 410);
}

export function tooManyRequests(
  message = "Too many requests. Please try again later.",
  retryAfterMs?: number,
) {
  return errorResponse(message, 429, undefined, retryAfterHeader(retryAfterMs));
}

// 503 for globally shed traffic: the request was fine, the system is
// momentarily overloaded. Distinct from 429 (this specific caller is over its
// own limit) so clients and dashboards can tell "I'm being throttled" from
// "the service is shedding load".
export function serviceUnavailable(
  message = "The service is busy right now. Please retry in a moment.",
  retryAfterMs?: number,
) {
  return errorResponse(message, 503, undefined, retryAfterHeader(retryAfterMs));
}

export function internalError(error: unknown) {
  console.error("Internal server error:", error);
  return errorResponse("An unexpected error occurred", 500);
}
