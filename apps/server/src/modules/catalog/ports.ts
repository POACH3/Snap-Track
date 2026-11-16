import type { IdentifierState, ItemRef, StoreIdentifierType, StoreRef } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";
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
