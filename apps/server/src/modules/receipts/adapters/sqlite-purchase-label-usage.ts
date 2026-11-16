import type { Id } from "@snaptrack/core";
import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { COUNTED_STATUSES } from "../domain/receipt.ts";
import { lineItems, lineItemTags, receipts } from "./schema.ts";

/**
 * How purchases use categories and tags, for `catalog`'s `PurchaseLabelUsage` port (SPEC.md
 * §4.3): `catalog` can't read these tables, which belong to `receipts`. Wired in the composition
 * root. Synchronous, like the repositories.
 */
export class SqlitePurchaseLabelUsage {
  readonly #db: BetterSQLite3Database;

  constructor(db: BetterSQLite3Database) {
    this.#db = db;
  }

  categoryInUse(categoryId: Id): boolean {
    return (
      this.#db
        .select({ id: lineItems.id })
        .from(lineItems)
        .where(eq(lineItems.lineCategoryId, categoryId))
        .get() !== undefined
    );
  }

  tagInUse(tagId: Id): boolean {
    return (
      this.#db
        .select({ id: lineItemTags.lineItemId })
        .from(lineItemTags)
        .where(eq(lineItemTags.tagId, tagId))
        .get() !== undefined
    );
  }

  purchasesPerItem(): Map<Id, number> {
    const rows = this.#db
      .select({ itemId: lineItems.itemId, n: count() })
      .from(lineItems)
      .innerJoin(receipts, eq(receipts.id, lineItems.receiptId))
      .where(and(isNotNull(lineItems.itemId), inArray(receipts.status, [...COUNTED_STATUSES])))
      .groupBy(lineItems.itemId)
      .all();
    return new Map(rows.flatMap(({ itemId, n }) => (itemId === null ? [] : [[itemId, n] as const])));
  }

  lineTags(): { tagId: Id; lineId: Id; itemId: Id | null }[] {
    return this.#db
      .select({ tagId: lineItemTags.tagId, lineId: lineItems.id, itemId: lineItems.itemId })
      .from(lineItemTags)
      .innerJoin(lineItems, eq(lineItems.id, lineItemTags.lineItemId))
      .innerJoin(receipts, eq(receipts.id, lineItems.receiptId))
      .where(inArray(receipts.status, [...COUNTED_STATUSES]))
      .all();
  }
}
