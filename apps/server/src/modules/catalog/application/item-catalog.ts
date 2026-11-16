import type {
  IdentifierAnswer,
  IdentifierQuestion,
  IdentifierState,
  ItemDetail,
  ItemListEntry,
  ItemNameSource,
  ItemRef,
  LineItemSuggestion,
} from "@snaptrack/contracts";
import { err, newId, ok, type Id, type Result, type Transaction } from "@snaptrack/core";
import {
  identifyItem,
  lineIdentifiers,
  normalizeItemName,
  type LineForMatching,
  type LineIdentifier,
} from "../domain/items.ts";
import { planItemLearning, type ItemLearningChange, type ItemLearningPlan } from "../domain/learning.ts";
import { nameSimilarity } from "../domain/suggestions.ts";
import type { ItemIdentifierRepository, ItemRepository } from "../ports.ts";

export interface ItemCatalogDeps {
  items: ItemRepository;
  itemIdentifiers: ItemIdentifierRepository;
  transaction: Transaction;
}

/** How alike a line's text and an item's name must be to suggest the item (bigram Dice score). */
export const SIMILAR_ITEM_THRESHOLD = 0.6;
const SEARCH_LIMIT = 50;

export type ItemNotFound = { kind: "item-not-found" };
export type IdentifierNotFound = { kind: "identifier-not-found" };

/** A line as the item rules see it, with the model's readable name. */
export interface LineToMatch extends LineForMatching {
  readonly suggestedName: string | null;
}

/** One confirmed line with its item: what learning reads. */
export interface ConfirmedLine extends LineForMatching {
  readonly itemId: Id;
  /** The receipt was confirmed before with this line on this item. */
  readonly alreadyCounted: boolean;
}

export type ItemCatalog = ReturnType<typeof createItemCatalog>;

/** Items, their identifiers and matching (SPEC.md §5, §6.4 step 2, §6.7). */
export function createItemCatalog(deps: ItemCatalogDeps) {
  const savedFor = (identifiers: readonly LineIdentifier[]) =>
    deps.itemIdentifiers.findByValues(identifiers.map((i) => i.value));

  const refs = (ids: readonly Id[]) => new Map(deps.items.findByIds(ids).map((item) => [item.id, item]));

  function detail(itemId: Id): ItemDetail | undefined {
    const item = deps.items.findById(itemId);
    if (item === undefined) return undefined;
    const labels = deps.items.labelsOf([itemId]).get(itemId);
    return {
      item,
      categoryId: labels?.categoryId ?? null,
      tagIds: [...(labels?.tagIds ?? [])],
      identifiers: deps.itemIdentifiers.listForItem(itemId).map((row) => ({
        id: row.id,
        type: row.type,
        displayValue: row.displayValue,
        store:
          row.storeId === null || row.storeName === null ? null : { id: row.storeId, name: row.storeName },
        state: row.state,
        timesSeen: row.timesSeen,
        lastSeenAt: row.lastSeenAt,
      })),
    };
  }

  function identifyLine(line: LineForMatching, storeId: Id | null): ItemRef | undefined {
    const identifiers = lineIdentifiers(line, storeId);
    const found = identifyItem(identifiers, savedFor(identifiers));
    return found === undefined ? undefined : deps.items.findById(found.itemId);
  }

  return {
    /** The item each line matches by a known identifier, in order; undefined where none does. */
    identifyLines(storeId: Id | null, lines: readonly LineForMatching[]): (ItemRef | undefined)[] {
      return lines.map((line) => identifyLine(line, storeId));
    },

    /**
     * What to offer each line with no item (SPEC.md §6.4 step 2), worked out now: an item its
     * identifiers match, else the item with the most similar name, else the model's readable name
     * as a new item. Never applied until a person taps it.
     */
    suggestLines(storeId: Id | null, lines: readonly LineToMatch[]): (LineItemSuggestion | null)[] {
      const known = deps.items.all().flatMap((item) => {
        const name = normalizeItemName(item.name);
        return name === null ? [] : [{ item, name }];
      });
      return lines.map((line) => {
        const matched = identifyLine(line, storeId);
        if (matched !== undefined) return { kind: "existing", item: matched, reason: "identifier" };
        if (line.kind === "fee") return null;
        const texts = [line.suggestedName, line.rawName]
          .map((text) => (text === null ? null : normalizeItemName(text)))
          .filter((text): text is string => text !== null);
        const best = known
          .map(({ item, name }) => ({
            item,
            score: Math.max(0, ...texts.map((t) => nameSimilarity(t, name))),
          }))
          .filter(({ score }) => score >= SIMILAR_ITEM_THRESHOLD)
          .sort((a, b) => b.score - a.score)[0];
        if (best !== undefined) return { kind: "existing", item: best.item, reason: "similar" };
        const name = line.suggestedName?.trim() || line.rawName?.trim();
        return name === undefined || name === "" ? null : { kind: "new", name };
      });
    },

    /**
     * Synchronous, so a confirm can create a line's new item in the same transaction. `labels` are
     * a category and tags chosen for it "for this item" before it existed; the caller checks them.
     */
    createItem(
      name: string,
      nameSource: ItemNameSource,
      labels: { categoryId: Id | null; tagIds: readonly Id[] } = { categoryId: null, tagIds: [] },
    ): ItemRef {
      const item = { id: newId(), name, nameSource };
      deps.items.insert(item);
      if (labels.categoryId !== null) deps.items.setCategory(item.id, labels.categoryId);
      if (labels.tagIds.length > 0) deps.items.setTags(item.id, labels.tagIds);
      return item;
    },

    /** Each item's category and tags. */
    itemLabels(ids: readonly Id[]) {
      return deps.items.labelsOf(ids);
    },

    findItem(id: Id): ItemRef | undefined {
      return deps.items.findById(id);
    },

    itemRefs(ids: readonly Id[]): Map<Id, ItemRef> {
      return refs(ids);
    },

    /** What confirming these lines teaches; changes nothing. */
    planItems(
      storeId: Id,
      lines: readonly ConfirmedLine[],
      answers: readonly IdentifierAnswer[],
    ): ItemLearningPlan {
      const toLearn = lines.map((line) => ({
        itemId: line.itemId,
        identifiers: lineIdentifiers(line, storeId),
        alreadyCounted: line.alreadyCounted,
      }));
      return planItemLearning({
        lines: toLearn,
        saved: savedFor(toLearn.flatMap((line) => line.identifiers)),
        answers: new Map(answers.map((a) => [a.key, a.move])),
      });
    },

    /** The plan's questions, with the items' names, for the confirm reply. */
    itemQuestions(plan: Extract<ItemLearningPlan, { kind: "questions" }>): IdentifierQuestion[] {
      const names = refs(plan.questions.flatMap((q) => [q.savedForItemId, q.movingToItemId]));
      return plan.questions.flatMap((q) => {
        const savedFor = names.get(q.savedForItemId);
        const movingTo = names.get(q.movingToItemId);
        return savedFor === undefined || movingTo === undefined
          ? []
          : [
              {
                key: q.key,
                about: "item" as const,
                identifier: q.identifier,
                savedFor: { id: savedFor.id, name: savedFor.name },
                movingTo: movingTo.name,
              },
            ];
      });
    },

    applyItems(changes: readonly ItemLearningChange[], receiptId: Id | null): void {
      for (const change of changes) {
        switch (change.kind) {
          case "insert":
            deps.itemIdentifiers.insert({
              ...change.identifier,
              itemId: change.itemId,
              firstReceiptId: receiptId,
            });
            break;
          case "seen":
            deps.itemIdentifiers.markSeen(change.rowId);
            break;
          case "move":
            deps.itemIdentifiers.move(change.rowId, change.itemId, receiptId);
            break;
          case "mark-ambiguous":
            deps.itemIdentifiers.setState(change.rowId, "ambiguous");
            break;
        }
      }
    },

    searchItems(query: string): ItemListEntry[] {
      return deps.items
        .search(query.trim(), SEARCH_LIMIT)
        .map(({ item, identifierCount }) => ({ ...item, identifierCount }));
    },

    itemDetail: detail,

    /** A person's name for the item, shown on every purchase of it at once (SPEC.md §6.7). */
    renameItem(id: Id, name: string): Result<ItemRef, ItemNotFound> {
      return deps.transaction.run(() => {
        if (deps.items.findById(id) === undefined) return err({ kind: "item-not-found" as const });
        deps.items.rename(id, name);
        return ok({ id, name, nameSource: "user" as const });
      });
    },

    removeItemIdentifier(id: Id): Result<ItemDetail, IdentifierNotFound> {
      return deps.transaction.run(() => {
        const row = deps.itemIdentifiers.findById(id);
        if (row === undefined) return err({ kind: "identifier-not-found" as const });
        deps.itemIdentifiers.remove(id);
        return ok(detail(row.itemId) as ItemDetail);
      });
    },

    setItemIdentifierState(id: Id, state: IdentifierState): Result<ItemDetail, IdentifierNotFound> {
      return deps.transaction.run(() => {
        const row = deps.itemIdentifiers.findById(id);
        if (row === undefined) return err({ kind: "identifier-not-found" as const });
        deps.itemIdentifiers.setState(id, state);
        return ok(detail(row.itemId) as ItemDetail);
      });
    },
  };
}
