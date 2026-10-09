import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export type RequestUser = Pick<
  Doc<"users">,
  "_id" | "name" | "email" | "role" | "clientId" | "active" | "liveTracking"
> & {
  siteIds: Doc<"sites">["_id"][];
};

export async function getUserByLegacyId(
  ctx: QueryCtx,
  legacyId: string,
): Promise<RequestUser | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId))
    .unique();

  if (!user || !user.active) {
    return null;
  }

  const siteAssignments = await ctx.db
    .query("userSiteAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .collect();

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    active: user.active,
    liveTracking: user.liveTracking,
    siteIds: siteAssignments.map((assignment) => assignment.siteId),
  };
}
