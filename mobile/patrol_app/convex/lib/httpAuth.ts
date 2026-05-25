import { api } from "../_generated/api";
import { verifyPatrolToken } from "./jwt";

export async function requireAuth(
  ctx: {
    runQuery: (reference: unknown, args: Record<string, unknown>) => Promise<unknown>;
  },
  request: Request,
) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }

  try {
    const payload = await verifyPatrolToken(token);
    const profile = (await ctx.runQuery(api.users.getSafeProfile, {
      userId: payload.userId as never,
    })) as {
      id: string;
      convexId: string;
      name: string;
      email: string;
      role: string;
      phone: string;
      active: boolean;
      clientId: string | null;
      clientName: string | null;
      liveTracking: boolean;
      siteIds: string[];
    } | null;
    return profile;
  } catch {
    return null;
  }
}
