import type { Id } from "../_generated/dataModel";

/**
 * Who a caller is allowed to read, worked out once instead of at every route.
 *
 * The bug this exists to kill: routes decided scope with
 *
 *     clientId: user.role === "admin" ? undefined : user.clientId
 *
 * which reads as "admins see everything, everyone else is pinned to their own
 * tenant". It is not what it does. A guard works for the security company
 * rather than for one customer, so a guard carries no clientId at all — see
 * `isAssignedUnderClient` in authHelpers.ts, which exists for exactly that
 * reason. `user.clientId` is therefore `undefined` for a guard, the filter is
 * dropped, and the guard lands in the same branch as an admin.
 *
 * That leaked every client's sites, checkpoints (including the QR code values),
 * geofence coordinates, patrol schedules, incidents, scans and handovers to any
 * guard with a valid token. Proven end-to-end before this module existed.
 *
 * The fix is to stop inferring scope from the *absence* of a field. Scope is
 * now derived from the role, explicitly, with an unscoped result reachable only
 * by the two roles that are actually unscoped.
 */
export type ViewerScope =
  /** Admin and supervisor: unscoped staff, by deliberate product decision. */
  | { kind: "all" }
  /** A client portal account: pinned to the one tenant it belongs to. */
  | { kind: "client"; clientId: Id<"clients"> }
  /** A guard: pinned to the locations they are actually posted to. */
  | { kind: "sites"; siteIds: Id<"sites">[]; clientIds: Id<"clients">[] }
  /**
   * Nothing. A portal account with no tenant, a guard posted nowhere, or a role
   * this module does not recognise. Callers must return an empty result rather
   * than querying — "no scope" must never fall through to "no filter".
   */
  | { kind: "none" };

export interface ScopedViewer {
  role: string;
  clientId?: string | null;
  /** Sites this user is posted to (guards). Empty for staff and portal users. */
  siteIds?: readonly string[];
  /** Tenants those postings belong to. Lets a guard still see a site-less row. */
  clientIds?: readonly string[];
}

export function scopeFor(user: ScopedViewer): ViewerScope {
  const role = user.role?.trim().toLowerCase();

  // Unscoped staff. Supervisors are deliberately as broad as admins here; that
  // is the rule the rest of the API already applies and the two must not
  // disagree about what one role can see.
  if (role === "admin" || role === "supervisor") return { kind: "all" };

  if (role === "main_account") {
    return user.clientId
      ? { kind: "client", clientId: user.clientId as Id<"clients"> }
      : { kind: "none" };
  }

  if (role === "guard") {
    const siteIds = (user.siteIds ?? []) as Id<"sites">[];
    const clientIds = (user.clientIds ?? []) as Id<"clients">[];
    // A guard posted nowhere has no records to read. Returning "all" here is
    // the original bug; returning "none" is the only safe reading.
    if (siteIds.length === 0 && clientIds.length === 0) return { kind: "none" };
    return { kind: "sites", siteIds, clientIds };
  }

  // An unrecognised role gets nothing. New roles must opt in here consciously.
  return { kind: "none" };
}

/**
 * The scope, projected into the arguments the internal queries take.
 *
 * `siteIds` present means "filter to these locations"; absent means no site
 * filter at all. An empty array is meaningful and must survive the trip — it
 * means "match nothing" — so callers holding a `none` scope are expected to
 * short-circuit before ever getting here.
 */
export interface ScopeArgs {
  clientId?: Id<"clients">;
  siteIds?: Id<"sites">[];
  siteClientIds?: Id<"clients">[];
}

export function scopeArgs(scope: ViewerScope): ScopeArgs {
  switch (scope.kind) {
    case "all":
      return {};
    case "client":
      return { clientId: scope.clientId };
    case "sites":
      return { siteIds: scope.siteIds, siteClientIds: scope.clientIds };
    case "none":
      // Deliberately unreachable in correct callers. Kept total, and kept
      // fail-closed, so a caller that forgets to short-circuit still matches
      // nothing instead of everything.
      return { siteIds: [], siteClientIds: [] };
  }
}

/**
 * Is this row inside the caller's scope?
 *
 * Applied *in addition to* whatever tenant filtering a query already does, not
 * instead of it — several queries carry extra matching rules (a handover
 * reachable through either participant, a scan reachable through its
 * checkpoint) that are still wanted.
 *
 * A row with no siteId is matched through its tenant instead, so rows written
 * before the site column existed are not hidden from the guard who owns them.
 * A row with neither is refused: nothing ties it to the caller.
 */
export function rowInScope(
  args: ScopeArgs,
  row: {
    clientId?: Id<"clients"> | string | null;
    siteId?: Id<"sites"> | string | null;
  },
): boolean {
  if (args.siteIds) {
    const siteIds = args.siteIds as readonly string[];
    if (row.siteId && siteIds.includes(String(row.siteId))) return true;
    // Site-less but tenant-owned: fall back to the tenants this caller is
    // posted under, mirroring isAssignedUnderClient().
    if (!row.siteId && row.clientId) {
      const clientIds = (args.siteClientIds ?? []) as readonly string[];
      return clientIds.includes(String(row.clientId));
    }
    return false;
  }
  if (args.clientId) return String(row.clientId ?? "") === String(args.clientId);
  return true;
}
