import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type DeletedEntityType = "user" | "site" | "checkpoint";

/**
 * Records the name of a row that is about to be hard-deleted.
 *
 * Deleting a guard or a location removes the row but deliberately keeps the
 * patrol history pointing at it, so every downstream name lookup starts
 * returning undefined and old records render blank. Call this immediately
 * before `ctx.db.delete` so the name survives on the history.
 */
export async function recordTombstone(
  ctx: MutationCtx,
  args: {
    entityType: DeletedEntityType;
    entityId: string;
    name: string;
    deletedByUserId?: Id<"users">;
    deletedByName?: string;
  },
) {
  await ctx.db.insert("deletedEntities", { ...args, deletedAt: Date.now() });
}

/**
 * Names of every deleted row of one type, keyed by original id.
 *
 * Callers merge this *behind* the live table — live row wins, tombstone fills
 * the gap, blank only when neither has it — so a name never changes for a row
 * that still exists.
 */
export async function deletedNamesByType(
  ctx: QueryCtx | MutationCtx,
  entityType: DeletedEntityType,
): Promise<Map<string, string>> {
  const rows = await ctx.db
    .query("deletedEntities")
    .withIndex("by_entityType", (q) => q.eq("entityType", entityType))
    .collect();
  return new Map(rows.map((r) => [r.entityId, r.name]));
}
