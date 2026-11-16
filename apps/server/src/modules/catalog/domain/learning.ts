import type { IdentifierRef, ItemIdentifierType, StoreMatchedBy } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";
import type { SavedIdentifier } from "./identify-store.ts";
import { isStrong, lookupKey, toRef, type ReceiptIdentifier } from "./identifiers.ts";
import { itemKey, type LineIdentifier, type SavedItemIdentifier } from "./items.ts";

// Learning from a confirmed receipt (SPEC.md §6.7): one implementation for stores and items.
// Save each identifier for its owner, count it as seen again, ask before moving one saved for
// another owner, and mark ambiguous what must not match again.

// ---------- the shared core ----------

interface Candidate<T> {
  readonly identifier: T;
  /** Identifiers sharing a group are the same detail for matching (a store's name types share one). */
  readonly group: string;
  /** Unique per saved row: (type, value), plus the store for item codes and names. */
  readonly exact: string;
}

interface Row<R> {
  readonly id: Id;
  readonly ownerId: Id;
  readonly state: "active" | "ambiguous";
  readonly group: string;
  readonly exact: string;
  /** Can't be moved (a shared address): marked ambiguous instead, and the user is told. */
  readonly supportOnly: boolean;
  readonly ref: R;
}

type Change<T> =
  | { readonly kind: "insert"; readonly ownerId: Id; readonly identifier: T }
  | { readonly kind: "seen"; readonly rowId: Id }
  | { readonly kind: "move"; readonly rowId: Id; readonly ownerId: Id }
  | { readonly kind: "mark-ambiguous"; readonly rowId: Id };

interface Question<R> {
  readonly key: Id;
  readonly identifier: R;
  readonly savedForOwnerId: Id;
  readonly movingToOwnerId: Id;
}

interface Collector<T, R> {
  changes: Change<T>[];
  questions: Question<R>[];
  notices: { identifier: R; alsoSavedForOwnerId: Id }[];
  /** Rows already decided in this plan. */
  handled: Set<Id>;
  /** Exact values already given to an owner in this plan. */
  claimed: Map<string, Id>;
}

const collector = <T, R>(): Collector<T, R> => ({
  changes: [],
  questions: [],
  notices: [],
  handled: new Set(),
  claimed: new Map(),
});

/** What learning `candidates` for `ownerId` changes, added to `into`. */
function learn<T, R>(
  into: Collector<T, R>,
  input: {
    ownerId: Id;
    candidates: readonly Candidate<T>[];
    rows: readonly Row<R>[];
    /** Owner whose rows made a wrong automatic match: they become ambiguous, unasked. */
    correcting: Id | null;
    /** The receipt was confirmed before with this owner, so its identifiers were already counted. */
    alreadyCounted: boolean;
    answers: ReadonlyMap<string, boolean>;
  },
): void {
  const byGroup = Map.groupBy(input.rows, (row) => row.group);
  for (const candidate of input.candidates) {
    // The same detail on two lines of one receipt goes to the first line's owner only.
    const claimedBy = into.claimed.get(candidate.exact);
    if (claimedBy !== undefined && claimedBy !== input.ownerId) continue;
    const rows = byGroup.get(candidate.group) ?? [];
    const exact = rows.find((row) => row.exact === candidate.exact);

    for (const row of rows) {
      if (row.ownerId === input.ownerId || row.state === "ambiguous" || into.handled.has(row.id)) continue;
      into.handled.add(row.id);
      if (row.supportOnly) {
        into.changes.push({ kind: "mark-ambiguous", rowId: row.id });
        into.notices.push({ identifier: row.ref, alsoSavedForOwnerId: row.ownerId });
      } else if (row.ownerId === input.correcting) {
        into.changes.push({ kind: "mark-ambiguous", rowId: row.id });
      } else {
        const answer = input.answers.get(row.id);
        if (answer === undefined) {
          into.questions.push({
            key: row.id,
            identifier: row.ref,
            savedForOwnerId: row.ownerId,
            movingToOwnerId: input.ownerId,
          });
        } else if (answer) into.changes.push({ kind: "move", rowId: row.id, ownerId: input.ownerId });
      }
    }

    if (claimedBy !== undefined) continue;
    into.claimed.set(candidate.exact, input.ownerId);
    if (exact === undefined) {
      into.changes.push({ kind: "insert", ownerId: input.ownerId, identifier: candidate.identifier });
    } else if (exact.ownerId === input.ownerId && !input.alreadyCounted) {
      into.changes.push({ kind: "seen", rowId: exact.id });
    }
  }
}

// ---------- stores ----------

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
  const { storeId, previous } = input;
  const into = collector<ReceiptIdentifier, IdentifierRef>();
  learn(into, {
    ownerId: storeId,
    candidates: input.identifiers.map((identifier) => ({
      identifier,
      group: lookupKey(identifier.type, identifier.value),
      exact: `${identifier.type}:${identifier.value}`,
    })),
    rows: input.saved.map((row) => ({
      id: row.id,
      ownerId: row.storeId,
      state: row.state,
      group: lookupKey(row.type, row.value),
      exact: `${row.type}:${row.value}`,
      // Both companies really are at a shared address: never moved (SPEC.md §6.7).
      supportOnly: !isStrong(row.type),
      ref: toRef(row),
    })),
    correcting:
      previous.matchedBy === "identifier" && previous.storeId !== null && previous.storeId !== storeId
        ? previous.storeId
        : null,
    alreadyCounted: previous.alreadyCounted,
    answers: input.answers,
  });

  if (into.questions.length > 0) {
    return {
      kind: "questions",
      questions: into.questions.map((q) => ({
        key: q.key,
        identifier: q.identifier,
        savedForStoreId: q.savedForOwnerId,
      })),
    };
  }
  return {
    kind: "changes",
    changes: into.changes.map((change): LearningChange =>
      change.kind === "move"
        ? { kind: "move", rowId: change.rowId }
        : change.kind === "insert"
          ? { kind: "insert", identifier: change.identifier }
          : change,
    ),
    notices: into.notices.map((n) => ({
      identifier: n.identifier,
      alsoSavedForStoreId: n.alsoSavedForOwnerId,
    })),
  };
}

// ---------- items ----------

/** One confirmed line with an item, and the identifiers it shows. */
export interface LineToLearn {
  readonly itemId: Id;
  readonly identifiers: readonly LineIdentifier[];
  /** The receipt was confirmed before with this line on this item. */
  readonly alreadyCounted: boolean;
}

export interface ItemIdentifierRef {
  readonly type: ItemIdentifierType;
  readonly displayValue: string;
}

export type ItemLearningChange =
  | { readonly kind: "insert"; readonly itemId: Id; readonly identifier: LineIdentifier }
  | { readonly kind: "seen"; readonly rowId: Id }
  | { readonly kind: "move"; readonly rowId: Id; readonly itemId: Id }
  | { readonly kind: "mark-ambiguous"; readonly rowId: Id };

export interface ItemLearningQuestion {
  readonly key: Id;
  readonly identifier: ItemIdentifierRef;
  readonly savedForItemId: Id;
  readonly movingToItemId: Id;
}

export type ItemLearningPlan =
  | { readonly kind: "questions"; readonly questions: readonly ItemLearningQuestion[] }
  | { readonly kind: "changes"; readonly changes: readonly ItemLearningChange[] };

/**
 * What confirming a receipt's lines teaches about items (SPEC.md §6.7): each line's identifiers
 * are saved for its item, asking before moving one saved for another item (a line given a
 * different item). Lines without an item teach nothing. The same detail on two lines goes to the
 * first line's item only.
 */
export function planItemLearning(input: {
  lines: readonly LineToLearn[];
  saved: readonly SavedItemIdentifier[];
  answers: ReadonlyMap<string, boolean>;
}): ItemLearningPlan {
  const into = collector<LineIdentifier, ItemIdentifierRef>();
  const rows = input.saved.map((row) => ({
    id: row.id,
    ownerId: row.itemId,
    state: row.state,
    group: itemKey(row),
    exact: itemKey(row),
    supportOnly: false,
    ref: { type: row.type, displayValue: row.displayValue },
  }));
  for (const line of input.lines) {
    learn(into, {
      ownerId: line.itemId,
      candidates: line.identifiers.map((identifier) => ({
        identifier,
        group: itemKey(identifier),
        exact: itemKey(identifier),
      })),
      rows,
      correcting: null,
      alreadyCounted: line.alreadyCounted,
      answers: input.answers,
    });
  }
  if (into.questions.length > 0) {
    return {
      kind: "questions",
      questions: into.questions.map((q) => ({
        key: q.key,
        identifier: q.identifier,
        savedForItemId: q.savedForOwnerId,
        movingToItemId: q.movingToOwnerId,
      })),
    };
  }
  return {
    kind: "changes",
    changes: into.changes.map((change): ItemLearningChange =>
      change.kind === "insert"
        ? { kind: "insert", itemId: change.ownerId, identifier: change.identifier }
        : change.kind === "move"
          ? { kind: "move", rowId: change.rowId, itemId: change.ownerId }
          : change,
    ),
  };
}
