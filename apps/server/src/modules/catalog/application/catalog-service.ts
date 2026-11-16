import type {
  IdentifierAnswer,
  IdentifierQuestion,
  IdentifierState,
  LearningNotice,
  StoreDetail,
  StoreEvidence,
  StoreIdentifierType,
  StoreIssue,
  StoreListEntry,
  StoreMatch,
  StoreMatchedBy,
  StoreRef,
  StoreSuggestion,
} from "@snaptrack/contracts";
import { err, newId, ok, type Id, type Result, type Transaction } from "@snaptrack/core";
import { identifyStore, type Identification } from "../domain/identify-store.ts";
import {
  identifiersFromEvidence,
  normalizeIdentifier,
  type ReceiptIdentifier,
} from "../domain/identifiers.ts";
import { planStoreLearning, type LearningChange, type LearningPlan } from "../domain/learning.ts";
import { rankSuggestions } from "../domain/suggestions.ts";
import type {
  ItemIdentifierRepository,
  ItemRepository,
  StoreIdentifierRepository,
  StoreIdentifierRow,
  StoreRepository,
} from "../ports.ts";
import { createItemCatalog, type ConfirmedLine } from "./item-catalog.ts";

export interface CatalogDeps {
  stores: StoreRepository;
  identifiers: StoreIdentifierRepository;
  items: ItemRepository;
  itemIdentifiers: ItemIdentifierRepository;
  transaction: Transaction;
}

/** Most stores the picker's search returns. */
const SEARCH_LIMIT = 20;

export type NeedsAnswers = { kind: "needs-answers"; questions: IdentifierQuestion[] };
export type StoreNotFound = { kind: "store-not-found" };
export type NameTaken = { kind: "name-taken" };
export type IdentifierNotFound = { kind: "identifier-not-found" };

export type CatalogService = ReturnType<typeof createCatalogService>;

export function createCatalogService(deps: CatalogDeps) {
  const itemCatalog = createItemCatalog(deps);
  const savedFor = (identifiers: readonly ReceiptIdentifier[]) =>
    deps.identifiers.findByValues(identifiers.map((identifier) => identifier.value));

  function identify(evidence: StoreEvidence): Identification {
    const identifiers = identifiersFromEvidence(evidence);
    return identifyStore(identifiers, savedFor(identifiers));
  }

  function refs(ids: readonly Id[]): Map<Id, StoreRef> {
    return new Map(deps.stores.findByIds([...new Set(ids)]).map((store) => [store.id, store]));
  }

  function storeDetail(storeId: Id): StoreDetail | undefined {
    const store = deps.stores.findById(storeId);
    if (store === undefined) return undefined;
    return {
      store,
      identifiers: deps.identifiers.listForStore(storeId).map((row) => ({
        id: row.id,
        type: row.type,
        displayValue: row.displayValue,
        state: row.state,
        timesSeen: row.timesSeen,
        lastSeenAt: row.lastSeenAt,
        addedByHand: row.firstReceiptId === null,
      })),
    };
  }

  /** The plan's questions, with the stores' names. */
  function questionsOf(
    plan: Extract<LearningPlan, { kind: "questions" }>,
    movingTo: string,
  ): IdentifierQuestion[] {
    const names = refs(plan.questions.map((question) => question.savedForStoreId));
    return plan.questions.flatMap((question) => {
      const savedFor = names.get(question.savedForStoreId);
      return savedFor === undefined
        ? []
        : [
            {
              key: question.key,
              about: "store" as const,
              identifier: question.identifier,
              savedFor,
              movingTo,
            },
          ];
    });
  }

  function apply(changes: readonly LearningChange[], storeId: Id, receiptId: Id | null): void {
    for (const change of changes) {
      switch (change.kind) {
        case "insert":
          deps.identifiers.insert({ storeId, ...change.identifier, firstReceiptId: receiptId });
          break;
        case "seen":
          deps.identifiers.markSeen(change.rowId);
          break;
        case "move":
          deps.identifiers.move(change.rowId, storeId, receiptId);
          break;
        case "mark-ambiguous":
          deps.identifiers.setState(change.rowId, "ambiguous");
          break;
      }
    }
  }

  const answerMap = (answers: readonly IdentifierAnswer[]) =>
    new Map(answers.map((answer) => [answer.key, answer.move]));

  return {
    ...itemCatalog,

    /** The store a receipt's evidence identifies, or undefined if it needs a person (SPEC.md §6.4). */
    identifyStore(evidence: StoreEvidence): { storeId: Id; match: StoreMatch } | undefined {
      const result = identify(evidence);
      return result.kind === "matched" ? { storeId: result.storeId, match: result.match } : undefined;
    },

    /** Why a receipt with no store needs a person, and the stores to offer, worked out now. */
    reviewStore(evidence: StoreEvidence): { issue: StoreIssue; suggestions: StoreSuggestion[] } {
      const result = identify(evidence);
      const ranked = rankSuggestions(result, evidence, deps.stores.knownStores());
      const names = refs(ranked.map((suggestion) => suggestion.storeId));
      return {
        // A store learned since the receipt was read matches now, but a person still chooses it.
        issue: result.kind === "matched" ? "unknown" : result.issue,
        suggestions: ranked.flatMap((suggestion) => {
          const store = names.get(suggestion.storeId);
          return store === undefined
            ? []
            : [{ store, reason: suggestion.reason, identifiers: [...suggestion.identifiers] }];
        }),
      };
    },

    /**
     * Learns every identifier on a confirmed receipt for its store (SPEC.md §6.7). Synchronous, so
     * the caller runs it in the transaction that confirms the receipt. Changes nothing while any
     * question about moving an identifier has no answer.
     */
    learnFromConfirmedReceipt(input: {
      receiptId: Id;
      storeId: Id;
      evidence: StoreEvidence;
      previous: { storeId: Id | null; matchedBy: StoreMatchedBy | null; alreadyCounted: boolean };
      /** The receipt's lines that have an item; lines without one teach nothing. */
      lines: readonly ConfirmedLine[];
      answers: readonly IdentifierAnswer[];
    }): Result<{ notices: LearningNotice[] }, NeedsAnswers> {
      const identifiers = identifiersFromEvidence(input.evidence);
      const plan = planStoreLearning({
        storeId: input.storeId,
        identifiers,
        saved: savedFor(identifiers),
        previous: input.previous,
        answers: answerMap(input.answers),
      });
      const items = itemCatalog.planItems(input.storeId, input.lines, input.answers);
      // Store and item questions are asked together; nothing is learned until all are answered.
      if (plan.kind === "questions" || items.kind === "questions") {
        const storeName = deps.stores.findById(input.storeId)?.name ?? "";
        return err({
          kind: "needs-answers",
          questions: [
            ...(plan.kind === "questions" ? questionsOf(plan, storeName) : []),
            ...(items.kind === "questions" ? itemCatalog.itemQuestions(items) : []),
          ],
        });
      }
      apply(plan.changes, input.storeId, input.receiptId);
      itemCatalog.applyItems(items.changes, input.receiptId);
      const names = refs(plan.notices.map((notice) => notice.alsoSavedForStoreId));
      return ok({
        notices: plan.notices.flatMap((notice) => {
          const alsoSavedFor = names.get(notice.alsoSavedForStoreId);
          return alsoSavedFor === undefined
            ? []
            : [{ kind: "shared_address" as const, identifier: notice.identifier, alsoSavedFor }];
        }),
      });
    },

    /** Synchronous, so a confirm can create its new store in the same transaction. */
    createStore(name: string): Result<StoreRef, NameTaken> {
      const store = { id: newId(), name };
      return deps.stores.insert(store) ? ok(store) : err({ kind: "name-taken" });
    },

    findStore(id: Id): StoreRef | undefined {
      return deps.stores.findById(id);
    },

    storeRefs(ids: readonly Id[]): Map<Id, StoreRef> {
      return refs(ids);
    },

    searchStores(query: string): StoreRef[] {
      return deps.stores.search(query.trim(), SEARCH_LIMIT);
    },

    listStores(): StoreListEntry[] {
      return deps.stores
        .listWithCounts()
        .map(({ store, identifierCount }) => ({ ...store, identifierCount }));
    },

    storeDetail,

    renameStore(id: Id, name: string): Result<StoreRef, StoreNotFound | NameTaken> {
      return deps.transaction.run(() => {
        if (deps.stores.findById(id) === undefined) return err({ kind: "store-not-found" as const });
        if (!deps.stores.rename(id, name)) return err({ kind: "name-taken" as const });
        return ok({ id, name });
      });
    },

    /**
     * Adds an identifier typed in the Library, by the same rules as one learned from a receipt:
     * normalized, and moved from another store only when the user says so (SPEC.md §6.7).
     */
    addIdentifier(input: {
      storeId: Id;
      type: StoreIdentifierType;
      value: string;
      answers: readonly IdentifierAnswer[];
    }): Result<
      StoreDetail,
      | StoreNotFound
      | NeedsAnswers
      | { kind: "invalid-identifier" }
      | { kind: "identifier-exists" }
      | { kind: "shared-address"; alsoSavedFor: StoreRef }
    > {
      return deps.transaction.run(() => {
        if (deps.stores.findById(input.storeId) === undefined)
          return err({ kind: "store-not-found" as const });
        const value = normalizeIdentifier(input.type, input.value);
        if (value === null) return err({ kind: "invalid-identifier" as const });
        const identifier = { type: input.type, value, displayValue: input.value.trim() };
        const saved = savedFor([identifier]);
        if (
          saved.some((row) => row.storeId === input.storeId && row.type === input.type && row.value === value)
        ) {
          return err({ kind: "identifier-exists" as const });
        }
        const plan = planStoreLearning({
          storeId: input.storeId,
          identifiers: [identifier],
          saved,
          previous: { storeId: null, matchedBy: null, alreadyCounted: false },
          answers: answerMap(input.answers),
        });
        if (plan.kind === "questions") {
          const storeName = deps.stores.findById(input.storeId)?.name ?? "";
          return err({ kind: "needs-answers" as const, questions: questionsOf(plan, storeName) });
        }
        apply(plan.changes, input.storeId, null);
        // An address another store has can't be saved for this one too; it became shared instead.
        const [notice] = plan.notices;
        const shared = notice === undefined ? undefined : deps.stores.findById(notice.alsoSavedForStoreId);
        if (shared !== undefined && !plan.changes.some((change) => change.kind === "insert")) {
          return err({ kind: "shared-address" as const, alsoSavedFor: shared });
        }
        return ok(storeDetail(input.storeId) as StoreDetail);
      });
    },

    removeIdentifier(id: Id): Result<StoreDetail, IdentifierNotFound> {
      return deps.transaction.run(() => {
        const row: StoreIdentifierRow | undefined = deps.identifiers.findById(id);
        if (row === undefined) return err({ kind: "identifier-not-found" as const });
        deps.identifiers.remove(id);
        return ok(storeDetail(row.storeId) as StoreDetail);
      });
    },

    setIdentifierState(id: Id, state: IdentifierState): Result<StoreDetail, IdentifierNotFound> {
      return deps.transaction.run(() => {
        const row = deps.identifiers.findById(id);
        if (row === undefined) return err({ kind: "identifier-not-found" as const });
        deps.identifiers.setState(id, state);
        return ok(storeDetail(row.storeId) as StoreDetail);
      });
    },
  };
}
