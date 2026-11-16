import type { IdentifierRef, StoreMatchedBy } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";
import type { SavedIdentifier } from "./identify-store.ts";
import { isStrong, lookupKey, toRef, type ReceiptIdentifier } from "./identifiers.ts";

/** How the receipt's store was set before this confirm. */
export interface PreviousStore {
  readonly storeId: Id | null;
  readonly matchedBy: StoreMatchedBy | null;
  /** It was confirmed with this same store before, so its identifiers were already counted. */
  readonly alreadyCounted: boolean;
}

export type LearningChange =
  | { readonly kind: "insert"; readonly identifier: ReceiptIdentifier }
  | { readonly kind: "seen"; readonly rowId: Id }
  | { readonly kind: "move"; readonly rowId: Id }
  | { readonly kind: "mark-ambiguous"; readonly rowId: Id };

/** "This phone number is saved for Target. Move it?" Keyed by the saved row's id. */
export interface LearningQuestion {
  readonly key: Id;
  readonly identifier: IdentifierRef;
  readonly savedForStoreId: Id;
}

export interface SharedAddressNotice {
  readonly identifier: IdentifierRef;
  readonly alsoSavedForStoreId: Id;
}

export type LearningPlan =
  | { readonly kind: "questions"; readonly questions: readonly LearningQuestion[] }
  | {
      readonly kind: "changes";
      readonly changes: readonly LearningChange[];
      readonly notices: readonly SharedAddressNotice[];
    };

/**
 * What confirming a receipt for `storeId` teaches the catalog (SPEC.md §6.7). `saved` is every
 * saved identifier sharing a value with the receipt's, for any store. `answers` maps a question's
 * key to whether to move that identifier. Until every question has an answer, nothing changes.
 */
export function planStoreLearning(input: {
  storeId: Id;
  identifiers: readonly ReceiptIdentifier[];
  saved: readonly SavedIdentifier[];
  previous: PreviousStore;
  answers: ReadonlyMap<string, boolean>;
}): LearningPlan {
  const { storeId, previous, answers } = input;
  const byKey = Map.groupBy(input.saved, (row) => lookupKey(row.type, row.value));
  // A wrong automatic match is being corrected: what made it must not match again.
  const correcting =
    previous.matchedBy === "identifier" && previous.storeId !== null && previous.storeId !== storeId
      ? previous.storeId
      : null;

  const changes: LearningChange[] = [];
  const notices: SharedAddressNotice[] = [];
  const questions: LearningQuestion[] = [];
  const handled = new Set<Id>();

  for (const identifier of input.identifiers) {
    const rows = byKey.get(lookupKey(identifier.type, identifier.value)) ?? [];
    const exact = rows.find((row) => row.type === identifier.type && row.value === identifier.value);

    for (const row of rows) {
      if (row.storeId === storeId || row.state === "ambiguous" || handled.has(row.id)) continue;
      handled.add(row.id);
      if (!isStrong(row.type)) {
        // Both companies really are there: a shared location, never moved (SPEC.md §6.7).
        changes.push({ kind: "mark-ambiguous", rowId: row.id });
        notices.push({ identifier: toRef(row), alsoSavedForStoreId: row.storeId });
      } else if (row.storeId === correcting) {
        changes.push({ kind: "mark-ambiguous", rowId: row.id });
      } else {
        const answer = answers.get(row.id);
        if (answer === undefined)
          questions.push({ key: row.id, identifier: toRef(row), savedForStoreId: row.storeId });
        else if (answer) changes.push({ kind: "move", rowId: row.id });
      }
    }

    if (exact === undefined) changes.push({ kind: "insert", identifier });
    else if (exact.storeId === storeId && !previous.alreadyCounted)
      changes.push({ kind: "seen", rowId: exact.id });
  }

  if (questions.length > 0) return { kind: "questions", questions };
  return { kind: "changes", changes, notices };
}
