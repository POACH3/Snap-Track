// The hierarchy and tags as the model sees them: numbered lists in the prompt, so its answer is
// a number we map back to an id, never a name we would have to match (SPEC.md §6.3).
import type { ExtractedReceipt } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";

export interface LabelChoices {
  readonly categories: readonly { id: Id; path: string }[];
  readonly tags: readonly { id: Id; name: string }[];
}

/** The lists as numbered in one prompt; numbers start at 1. */
export interface NumberedLabels {
  /** "1: Groceries", "2: Groceries › Dairy", … */
  readonly categoryLines: readonly string[];
  readonly tagLines: readonly string[];
  readonly categoryIds: readonly Id[];
  readonly tagIds: readonly Id[];
}

export function numberLabels(choices: LabelChoices): NumberedLabels {
  return {
    categoryLines: choices.categories.map((c, index) => `${index + 1}: ${c.path}`),
    tagLines: choices.tags.map((t, index) => `${index + 1}: ${t.name}`),
    categoryIds: choices.categories.map((c) => c.id),
    tagIds: choices.tags.map((t) => t.id),
  };
}

export interface LineGuess {
  readonly suggestedCategoryId: Id | null;
  readonly suggestedTagIds: readonly Id[];
}

const at = (ids: readonly Id[], n: number | null): Id | null =>
  n !== null && Number.isInteger(n) && n >= 1 ? (ids[n - 1] ?? null) : null;

/** Each line's guess, in order, with numbers not on the lists dropped. */
export function guessesFrom(extracted: ExtractedReceipt, labels: NumberedLabels): LineGuess[] {
  return extracted.lines.map((line) => ({
    suggestedCategoryId: at(labels.categoryIds, line.category ?? null),
    suggestedTagIds: [...new Set(line.tags.flatMap((n) => at(labels.tagIds, n) ?? []))],
  }));
}
