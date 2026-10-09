import { internal } from "../_generated/api";
import { verifyPatrolToken } from "./jwt";

export async function requireAuth(
  ctx: any,
  request: Request,
  // [tenant-isolation] Client (main_account) logins are portal-only. Only
  // /auth/me and the /client/* routes opt in via allowClientPortal — every
  // other route rejects client credentials here, so a client token can never
  // pull staff data (guard identities, other tenants' records) out of the
  // general API even if a route forgets its own role check.
  opts?: { allowClientPortal?: boolean },
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
    const profile = (await ctx.runQuery(internal.users.getSafeProfile, {
      userId: payload.userId,
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
      // Tenants this user is posted under. Load-bearing for guards, who have no
      // clientId of their own — see lib/scope.ts.
      clientIds: string[];
    } | null;
    if (profile?.role === "main_account" && !opts?.allowClientPortal) {
      return null;
    }
    return profile;
  } catch {
    return null;
  }
}
