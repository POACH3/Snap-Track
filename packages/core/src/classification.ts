// Where a purchase's category and tags come from (SPEC.md §5, Classification rules). One rule,
// used by the server (catalog re-exports it) and by the receipt page while a person edits.
import type { Id } from "./ids.ts";

/** `line`: set on this purchase; `item`: set for its item; `store`: its store's default. */
export type CategorySource = "line" | "item" | "store";

export interface EffectiveCategory {
  readonly categoryId: Id;
  readonly source: CategorySource;
}

/**
 * A line's category: this purchase's, else its item's, else its store's default; null when none
 * applies (Unclassified). Worked out when read, never stored.
 */
export function effectiveCategory(set: {
  line: Id | null;
  item: Id | null;
  store: Id | null;
}): EffectiveCategory | null {
  if (set.line !== null) return { categoryId: set.line, source: "line" };
  if (set.item !== null) return { categoryId: set.item, source: "item" };
  if (set.store !== null) return { categoryId: set.store, source: "store" };
  return null;
}

/** A line's tags: its item's, then its own (any its item already has are left out of its own). */
export function lineTags(
  itemTagIds: readonly Id[],
  lineTagIds: readonly Id[],
): { fromItem: Id[]; fromLine: Id[] } {
  const fromItem = [...new Set(itemTagIds)];
  const onItem = new Set(fromItem);
  return { fromItem, fromLine: [...new Set(lineTagIds)].filter((id) => !onItem.has(id)) };
}

export type SuggestionOutcome = "accepted" | "dismissed";

/**
 * What of the software's guess to show on a line (SPEC.md §5, "Guesses are never applied"): the
 * category only while no user-set category applies, the tags the line doesn't have yet, and
 * nothing once the guess was accepted or dismissed. Ids not in `usable` (unknown or archived
 * entries) are never shown.
 */
export function pendingSuggestion(line: {
  effective: EffectiveCategory | null;
  suggestedCategoryId: Id | null;
  suggestedTagIds: readonly Id[];
  tagIds: readonly Id[];
  outcome: SuggestionOutcome | null;
  usable: (id: Id) => boolean;
}): { categoryId: Id | null; tagIds: Id[] } | null {
  if (line.outcome !== null) return null;
  const categoryId =
    line.effective === null && line.suggestedCategoryId !== null && line.usable(line.suggestedCategoryId)
      ? line.suggestedCategoryId
      : null;
  const has = new Set(line.tagIds);
  const tagIds = [...new Set(line.suggestedTagIds)].filter((id) => !has.has(id) && line.usable(id));
  return categoryId === null && tagIds.length === 0 ? null : { categoryId, tagIds };
}
