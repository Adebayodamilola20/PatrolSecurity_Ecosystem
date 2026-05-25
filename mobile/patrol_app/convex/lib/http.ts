export function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return Response.json(body, { ...init, headers });
}

export function methodNotAllowed(method: string) {
  return json(
    { message: `Method ${method} is not allowed for this endpoint` },
    { status: 405 },
  );
}

export function notImplemented(feature: string) {
  return json(
    {
      message: `${feature} is not implemented yet in the Convex migration scaffold`,
    },
    { status: 501 },
  );
}

export async function parseJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await request.json();
  } catch {
    return null;
  }
}
