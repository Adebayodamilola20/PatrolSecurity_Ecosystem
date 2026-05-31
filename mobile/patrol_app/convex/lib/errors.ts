export function errorResponse(message: string, status: number, details?: string) {
  return Response.json(
    { message, ...(details ? { details } : {}), timestamp: new Date().toISOString() },
    { status },
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

export function tooManyRequests(message = "Too many requests. Please try again later.") {
  return errorResponse(message, 429);
}

export function internalError(error: unknown) {
  console.error("Internal server error:", error);
  return errorResponse("An unexpected error occurred", 500);
}
