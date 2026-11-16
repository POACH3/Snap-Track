import type { Clock, Id } from "@snaptrack/core";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { MergeRepository } from "../ports.ts";
import { categories, itemIdentifiers, items, itemTags, stores, storeIdentifiers, tags } from "./schema.ts";

type Db = BetterSQLite3Database;

/** The catalog's own rows in a merge (SPEC.md §4.3, Merges). Run inside the merge's transaction. */
export class SqliteMergeRepository implements MergeRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  #now() {
    return this.#clock.now().toISOString();
  }

  moveStoreIdentifiers(from: Id, to: Id): void {
    // Unique by (type, value) across all stores, so none collide.
    this.#db
      .update(storeIdentifiers)
      .set({ storeId: to, updatedAt: this.#now() })
      .where(eq(storeIdentifiers.storeId, from))
      .run();
  }

  moveItemIdentifiersToStore(from: Id, to: Id): void {
    const moving = this.#db.select().from(itemIdentifiers).where(eq(itemIdentifiers.storeId, from)).all();
    for (const row of moving) {
      const kept = this.#db
        .select()
        .from(itemIdentifiers)
        .where(
          and(
            eq(itemIdentifiers.storeId, to),
            eq(itemIdentifiers.type, row.type),
            eq(itemIdentifiers.value, row.value),
          ),
        )
        .get();
      if (kept === undefined) {
        this.#db
          .update(itemIdentifiers)
          .set({ storeId: to, updatedAt: this.#now() })
          .where(eq(itemIdentifiers.id, row.id))
          .run();
        continue;
      }
      // The kept store's row stays; if the two named different items, it can't tell them apart.
      this.#db
        .update(itemIdentifiers)
        .set({
          timesSeen: kept.timesSeen + row.timesSeen,
          ...(kept.itemId === row.itemId ? {} : { state: "ambiguous" as const }),
          updatedAt: this.#now(),
        })
        .where(eq(itemIdentifiers.id, kept.id))
        .run();
      this.#db.delete(itemIdentifiers).where(eq(itemIdentifiers.id, row.id)).run();
    }
  }

  moveItemIdentifiersToItem(from: Id, to: Id): void {
    // The item isn't part of the unique keys, so moving never collides.
    this.#db
      .update(itemIdentifiers)
      .set({ itemId: to, updatedAt: this.#now() })
      .where(eq(itemIdentifiers.itemId, from))
      .run();
  }

  moveItemTags(from: Id, to: Id): void {
    const fromTags = this.#db
      .select({ tagId: itemTags.tagId })
      .from(itemTags)
      .where(eq(itemTags.itemId, from))
      .all();
    if (fromTags.length > 0)
      this.#db
        .insert(itemTags)
        .values(fromTags.map(({ tagId }) => ({ itemId: to, tagId })))
        .onConflictDoNothing()
        .run();
    this.#db.delete(itemTags).where(eq(itemTags.itemId, from)).run();
  }

  moveTagOnItems(from: Id, to: Id): void {
    const tagged = this.#db
      .select({ itemId: itemTags.itemId })
      .from(itemTags)
      .where(eq(itemTags.tagId, from))
      .all();
    if (tagged.length > 0)
      this.#db
        .insert(itemTags)
        .values(tagged.map(({ itemId }) => ({ itemId, tagId: to })))
        .onConflictDoNothing()
        .run();
    this.#db.delete(itemTags).where(eq(itemTags.tagId, from)).run();
  }

  pointCategoryAt(from: Id, to: Id): void {
    const now = this.#now();
    this.#db.update(items).set({ categoryId: to, updatedAt: now }).where(eq(items.categoryId, from)).run();
    this.#db
      .update(stores)
      .set({ defaultCategoryId: to, updatedAt: now })
      .where(eq(stores.defaultCategoryId, from))
      .run();
  }

  /** The kept one's value wins; the merged-away one's fills a gap only. */
  fillStoreDefault(from: Id, to: Id): void {
    const [source] = this.#db
      .select({ value: stores.defaultCategoryId })
      .from(stores)
      .where(eq(stores.id, from))
      .all();
    if (source?.value == null) return;
    this.#db
      .update(stores)
      .set({ defaultCategoryId: source.value, updatedAt: this.#now() })
      .where(and(eq(stores.id, to), sql`${stores.defaultCategoryId} is null`))
      .run();
  }

  fillItemCategory(from: Id, to: Id): void {
    const [source] = this.#db.select({ value: items.categoryId }).from(items).where(eq(items.id, from)).all();
    if (source?.value == null) return;
    this.#db
      .update(items)
      .set({ categoryId: source.value, updatedAt: this.#now() })
      .where(and(eq(items.id, to), sql`${items.categoryId} is null`))
      .run();
  }

  deleteStore(id: Id): void {
    this.#db.delete(stores).where(eq(stores.id, id)).run();
  }

  deleteItem(id: Id): void {
    this.#db.delete(items).where(eq(items.id, id)).run();
  }

  deleteCategory(id: Id): void {
    this.#db.delete(categories).where(eq(categories.id, id)).run();
  }

  deleteTag(id: Id): void {
    this.#db.delete(tags).where(eq(tags.id, id)).run();
  }

  /** Keeps a merged parent's children attached while it is replaced (SPEC.md §5). */
  reparent(childIds: readonly Id[], parentId: Id): void {
    if (childIds.length === 0) return;
    this.#db
      .update(categories)
      .set({ parentId, updatedAt: this.#now() })
      .where(and(inArray(categories.id, [...childIds]), ne(categories.id, parentId)))
      .run();
  }
}
