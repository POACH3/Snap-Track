import type { Id } from "@snaptrack/core";
import { eq, like } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { lineItems, lineItemTags, receipts } from "./schema.ts";

/**
 * `receipts`' side of a merge, for `catalog`'s `CatalogMergeListener` port (SPEC.md §4.3,
 * Merges): its own rows that point at the merged-away entry move to the kept one. Runs inside the
 * merge's transaction; wired in the composition root.
 */
export class SqliteCatalogMergeListener {
  readonly #db: BetterSQLite3Database;

  constructor(db: BetterSQLite3Database) {
    this.#db = db;
  }

  storesMerged(from: Id, to: Id): void {
    this.#db.update(receipts).set({ storeId: to }).where(eq(receipts.storeId, from)).run();
  }

  itemsMerged(from: Id, to: Id): void {
    this.#db.update(lineItems).set({ itemId: to }).where(eq(lineItems.itemId, from)).run();
  }

  categoriesMerged(from: Id, to: Id): void {
    this.#db.update(lineItems).set({ lineCategoryId: to }).where(eq(lineItems.lineCategoryId, from)).run();
    this.#db
      .update(lineItems)
      .set({ suggestedCategoryId: to })
      .where(eq(lineItems.suggestedCategoryId, from))
      .run();
  }

  tagsMerged(from: Id, to: Id): void {
    const tagged = this.#db
      .select({ lineItemId: lineItemTags.lineItemId })
      .from(lineItemTags)
      .where(eq(lineItemTags.tagId, from))
      .all();
    if (tagged.length > 0)
      this.#db
        .insert(lineItemTags)
        .values(tagged.map(({ lineItemId }) => ({ lineItemId, tagId: to })))
        .onConflictDoNothing()
        .run();
    this.#db.delete(lineItemTags).where(eq(lineItemTags.tagId, from)).run();
    // The model's tag guesses are a JSON list on the line.
    const guessed = this.#db
      .select({ id: lineItems.id, ids: lineItems.suggestedTagIds })
      .from(lineItems)
      .where(like(lineItems.suggestedTagIds, `%${from}%`))
      .all();
    for (const { id, ids } of guessed) {
      const next = [...new Set((ids ?? []).map((tagId) => (tagId === from ? to : tagId)))];
      this.#db.update(lineItems).set({ suggestedTagIds: next }).where(eq(lineItems.id, id)).run();
    }
  }
}
