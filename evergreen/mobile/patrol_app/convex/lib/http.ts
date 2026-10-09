export function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return Response.json(body, { ...init, headers });
}

/**
 * Browser origins allowed to read API responses.
 *
 * Every route used to answer `Access-Control-Allow-Origin: *`. A bearer token
 * is never attached by the browser on its own, so that was not a hole by
 * itself, but it meant any website holding a stolen token could use it from
 * a victim's browser. Only our own two sites (plus local development) get to
 * read responses now. More can be added without a code change through
 * CORS_ALLOWED_ORIGINS, a comma-separated list of exact origins.
 *
 * The phone app is not a browser and sends no Origin, so it is unaffected.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://patrol-security-ecosystem.vercel.app",
  "https://evergreenclient-protective.vercel.app",
];

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (LOCAL_ORIGIN.test(origin)) return origin;
  const extra = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return DEFAULT_ALLOWED_ORIGINS.includes(origin) || extra.includes(origin)
    ? origin
    : null;
}

/**
 * Applied to every response on the way out (see the route wrapper in
 * http.ts), so no route can forget it: swaps the wildcard CORS header for the
 * caller's origin when it is one of ours, and adds the transport headers the
 * dashboard's own pages already send.
 */
export function applyResponsePolicy(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);

  const origin = allowedOrigin(request.headers.get("origin"));
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else {
    headers.delete("Access-Control-Allow-Origin");
  }
  headers.append("Vary", "Origin");

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  headers.set("Referrer-Policy", "no-referrer");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
