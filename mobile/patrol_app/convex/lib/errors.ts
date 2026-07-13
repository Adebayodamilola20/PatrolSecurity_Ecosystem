export function errorResponse(message: string, status: number, details?: string) {
  // Error responses need the same CORS headers as success responses, or the
  // browser blocks the cross-origin read and the fetch rejects with a generic
  // "Load failed" instead of surfacing our message (409 conflicts, 4xx, etc.).
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return Response.json(
    { message, ...(details ? { details } : {}), timestamp: new Date().toISOString() },
    { status, headers },
  );
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

export function tooManyRequests(message = "Too many requests. Please try again later.") {
  return errorResponse(message, 429);
}

export function internalError(error: unknown) {
  console.error("Internal server error:", error);
  return errorResponse("An unexpected error occurred", 500);
}
