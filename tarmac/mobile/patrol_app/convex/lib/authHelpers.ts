import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";

export type Role = "admin" | "main_account" | "supervisor" | "guard";

export type AuthUser = Doc<"users"> & {
  siteIds: Id<"sites">[];
};

export function isRole(value: string): value is Role {
  return ["admin", "main_account", "supervisor", "guard"].includes(value);
}

export async function getAuthUser(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", identity.email ?? ""))
    .unique();
  if (!user || !user.active) return null;
  const assignments = await ctx.db
    .query("userSiteAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .collect();
  return { ...user, siteIds: assignments.map((a) => a.siteId) };
}

export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthUser> {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Authentication required");
  return user;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: Role[],
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (!roles.includes(user.role as Role)) {
    throw new Error(
      `Access denied. Required role: ${roles.join(" or ")}, got: ${user.role}`,
    );
  }
  return user;
}

export function assertClientAccess(
  user: { role: string; clientId?: Id<"clients"> | null },
  targetClientId?: Id<"clients"> | null,
): void {
  if (user.role === "admin") return;
  if (!targetClientId) return;
  if (user.clientId && user.clientId !== targetClientId) {
    throw new Error("Access denied: cannot access other client's data");
  }
}

export function assertSiteAccess(
  user: AuthUser,
  targetSiteId?: Id<"sites"> | null,
): void {
  if (user.role === "admin") return;
  if (!targetSiteId) return;
  if (user.siteIds.includes(targetSiteId)) return;
  throw new Error("Access denied: cannot access this site's data");
}

/**
 * Is this user posted to that location?
 *
 * Site assignment is the load-bearing scope check for guards. They work for
 * the security company rather than for one customer, so most carry no clientId
 * at all, and this join table is the only thing tying a guard to a tenant's
 * records. Anywhere a guard reaches a row by id, this is the question.
 */
export async function isAssignedToSite(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  siteId: Id<"sites">,
): Promise<boolean> {
  const assignment = await ctx.db
    .query("userSiteAssignments")
    .withIndex("by_userId_siteId", (q) =>
      q.eq("userId", userId).eq("siteId", siteId),
    )
    .first();
  return assignment !== null;
}

/**
 * Is this user posted to any location belonging to that customer?
 *
 * The fallback for rows that name a client but no site. Assignment rows
 * predating the denormalised clientId column answer through their parent site
 * instead, so a legacy guard is not refused their own company's records.
 */
export async function isAssignedUnderClient(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  clientId: Id<"clients">,
): Promise<boolean> {
  const assignments = await ctx.db
    .query("userSiteAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const assignment of assignments) {
    if (assignment.clientId === clientId) return true;
    const site = await ctx.db.get(assignment.siteId);
    if (site?.clientId === clientId) return true;
  }
  return false;
}

export function assertSelfOrRole(
  user: { role: string; _id: Id<"users"> },
  targetUserId: Id<"users">,
  roles: Role[],
): void {
  if (roles.includes(user.role as Role)) return;
  if (user._id === targetUserId) return;
  throw new Error("Access denied");
}

export function requireExportRole(user: { role: string }): void {
  if (user.role !== "admin" && user.role !== "main_account") {
    throw new Error("Only Admin and Main Account can access exports");
  }
}
