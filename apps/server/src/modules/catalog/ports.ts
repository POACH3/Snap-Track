import type { IdentifierState, ItemRef, StoreIdentifierType, StoreRef } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";
import type { Entry } from "./domain/hierarchy.ts";
import type { SavedIdentifier } from "./domain/identify-store.ts";
import type { LineIdentifier, SavedItemIdentifier } from "./domain/items.ts";
import type { KnownStore } from "./domain/suggestions.ts";

/** A saved identifier with its history, for Library › Stores. */
export interface StoreIdentifierRow extends SavedIdentifier {
  readonly firstReceiptId: Id | null;
  readonly timesSeen: number;
  readonly lastSeenAt: string | null;
}

/** Repositories are synchronous (SPEC.md §3.1 rule 7). */
export interface StoreRepository {
  findById(id: Id): StoreRef | undefined;
  findByIds(ids: readonly Id[]): StoreRef[];
  /** Ignoring case. */
  findByName(name: string): StoreRef | undefined;
  /** Returns false, saving nothing, if the name is taken (ignoring case). */
  insert(store: StoreRef): boolean;
  /** Returns false if the name is taken by another store. */
  rename(id: Id, name: string): boolean;
  /** Names containing `query` (ignoring case), alphabetically. Every store when it is empty. */
  search(query: string, limit: number): StoreRef[];
  /** Every store with its number of identifiers, alphabetically. */
  listWithCounts(): { store: StoreRef; identifierCount: number }[];
  /** Every store with every name it goes by (its own and its saved name-like identifiers), for suggestions. */
  knownStores(): KnownStore[];
  defaultCategoryOf(id: Id): Id | null;
  setDefaultCategory(id: Id, categoryId: Id | null): void;
}

export interface StoreIdentifierRepository {
  /** Every saved identifier, of any type and state, whose normalized value is one of `values`. */
  findByValues(values: readonly string[]): StoreIdentifierRow[];
  findById(id: Id): StoreIdentifierRow | undefined;
  /** In the order they were first saved. */
  listForStore(storeId: Id): StoreIdentifierRow[];
  insert(identifier: {
    storeId: Id;
    type: StoreIdentifierType;
    value: string;
    displayValue: string;
    firstReceiptId: Id | null;
  }): void;
  /** Seen on one more receipt. */
  markSeen(id: Id): void;
  /** Now belongs to `storeId`, counted afresh from `receiptId` (null when moved by hand). */
  move(id: Id, storeId: Id, receiptId: Id | null): void;
  setState(id: Id, state: IdentifierState): void;
  remove(id: Id): void;
}

/** A saved item identifier with its history and its store's name, for Library › Items. */
export interface ItemIdentifierRow extends SavedItemIdentifier {
  readonly storeName: string | null;
  readonly timesSeen: number;
  readonly lastSeenAt: string | null;
}

export interface ItemRepository {
  findById(id: Id): ItemRef | undefined;
  findByIds(ids: readonly Id[]): ItemRef[];
  insert(item: ItemRef): void;
  /** Sets a person's name; it is never overwritten by automation after this. */
  rename(id: Id, name: string): void;
  /** Names containing `query` (ignoring case), alphabetically, with their identifier counts. */
  search(query: string, limit: number): { item: ItemRef; identifierCount: number }[];
  /** Every item's id and name, for similar-name suggestions. */
  all(): ItemRef[];
  /** Each item's category and tags; unknown items are left out. */
  labelsOf(ids: readonly Id[]): Map<Id, ItemLabels>;
  setCategory(id: Id, categoryId: Id | null): void;
  /** Replaces the item's tags. */
  setTags(id: Id, tagIds: readonly Id[]): void;
}

export interface ItemLabels {
  readonly categoryId: Id | null;
  readonly tagIds: readonly Id[];
}

export interface CategoryRepository {
  /** Every entry, archived ones included. */
  all(): Entry[];
  findById(id: Id): Entry | undefined;
  /** Returns false, saving nothing, if a sibling has the name (ignoring case). */
  insert(entry: Omit<Entry, "archived">): boolean;
  /** Returns false if a sibling has the name. */
  rename(id: Id, name: string): boolean;
  /** Returns false if a sibling under the new parent has its name. Children stay attached to it. */
  move(id: Id, parentId: Id): boolean;
  setArchived(ids: readonly Id[], archived: boolean): void;
  delete(id: Id): void;
  /** One more than the largest sort order under `parentId`. */
  nextSortOrder(parentId: Id | null): number;
  /** An item or a store default points to it. */
  isReferenced(id: Id): boolean;
}

export interface TagRepository {
  /** Every tag, archived ones included, alphabetically. */
  all(): { id: Id; name: string; archived: boolean }[];
  findById(id: Id): { id: Id; name: string; archived: boolean } | undefined;
  /** Returns false, saving nothing, if the name is taken (ignoring case). */
  insert(tag: { id: Id; name: string }): boolean;
  rename(id: Id, name: string): boolean;
  setArchived(id: Id, archived: boolean): void;
  delete(id: Id): void;
  /** An item has it. */
  isReferenced(id: Id): boolean;
  /** Each tag's items. */
  itemsByTag(): Map<Id, Id[]>;
}

/**
 * How purchases use categories and tags, which `catalog` can't read itself: the rows belong to
 * `receipts` (SPEC.md §4.3). Supplied by `receipts`, wired in the composition root. Synchronous.
 */
export interface PurchaseLabelUsage {
  /** A line has it as its own category. */
  categoryInUse(categoryId: Id): boolean;
  /** A line has it as its own tag. */
  tagInUse(tagId: Id): boolean;
  /** How many purchases (lines on receipts that count) each item has. */
  purchasesPerItem(): Map<Id, number>;
  /** Every tag set on a counted line, with the line's id and item. */
  lineTags(): { tagId: Id; lineId: Id; itemId: Id | null }[];
}

export interface ItemIdentifierRepository {
  /** Every saved identifier, of any type and state, whose normalized value is one of `values`. */
  findByValues(values: readonly string[]): ItemIdentifierRow[];
  findById(id: Id): ItemIdentifierRow | undefined;
  /** In the order they were first saved. */
  listForItem(itemId: Id): ItemIdentifierRow[];
  insert(identifier: LineIdentifier & { itemId: Id; firstReceiptId: Id | null }): void;
  markSeen(id: Id): void;
  move(id: Id, itemId: Id, receiptId: Id | null): void;
  setState(id: Id, state: IdentifierState): void;
  remove(id: Id): void;
}

/** The catalog's own rows in a merge (SPEC.md §4.3, Merges). Synchronous, inside the merge's transaction. */
export interface MergeRepository {
  moveStoreIdentifiers(from: Id, to: Id): void;
  /** Item codes and printed names saved for `from`; where `to` has the same one, its row stays. */
  moveItemIdentifiersToStore(from: Id, to: Id): void;
  moveItemIdentifiersToItem(from: Id, to: Id): void;
  /** `from`'s tags join `to`'s, without repeats. */
  moveItemTags(from: Id, to: Id): void;
  /** Items tagged `from` are tagged `to` instead, without repeats. */
  moveTagOnItems(from: Id, to: Id): void;
  /** Items' categories and stores' defaults that were `from` become `to`. */
  pointCategoryAt(from: Id, to: Id): void;
  /** `to` keeps its own; `from`'s fills a gap only. */
  fillStoreDefault(from: Id, to: Id): void;
  fillItemCategory(from: Id, to: Id): void;
  reparent(childIds: readonly Id[], parentId: Id): void;
  deleteStore(id: Id): void;
  deleteItem(id: Id): void;
  deleteCategory(id: Id): void;
  deleteTag(id: Id): void;
}

/**
 * Told about each merge inside its transaction, so `receipts` moves its own rows (SPEC.md §4.3):
 * `catalog` can't call `receipts`, which depends on it. Wired in the composition root.
 */
export interface CatalogMergeListener {
  storesMerged(from: Id, to: Id): void;
  itemsMerged(from: Id, to: Id): void;
  categoriesMerged(from: Id, to: Id): void;
  tagsMerged(from: Id, to: Id): void;
}
