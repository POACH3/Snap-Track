import type { Clock, Id } from "@snaptrack/core";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ListPosition } from "../domain/list-cursor.ts";
import type { Receipt, ReceiptImage, ReceiptWithImages } from "../domain/receipt.ts";
import type { ReceiptRepository } from "../ports.ts";
import { receiptImages, receipts } from "./schema.ts";

type Db = BetterSQLite3Database;
type ReceiptRow = typeof receipts.$inferSelect;
type ImageRow = typeof receiptImages.$inferSelect;

const toReceipt = (row: ReceiptRow): Receipt => ({
  id: row.id,
  loggedByUserId: row.loggedByUserId,
  source: row.source,
  status: row.status,
  capturedAt: row.capturedAt,
});

const toImage = (row: ImageRow): ReceiptImage => ({
  id: row.id,
  receiptId: row.receiptId,
  position: row.position,
  imageKey: row.imageKey,
  thumbnailKey: row.thumbnailKey,
  imageSha256: row.imageSha256,
});

export class SqliteReceiptRepository implements ReceiptRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  findById(id: Id): ReceiptWithImages | undefined {
    const row = this.#db.select().from(receipts).where(eq(receipts.id, id)).get();
    return row && this.#withImages([row])[0];
  }

  insert(receipt: Receipt, images: readonly ReceiptImage[]): boolean {
    const now = this.#clock.now().toISOString();
    const result = this.#db
      .insert(receipts)
      .values({ ...receipt, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: receipts.id })
      .run();
    if (result.changes === 0) return false;
    if (images.length > 0) {
      this.#db
        .insert(receiptImages)
        .values(images.map((image) => ({ ...image, createdAt: now, updatedAt: now })))
        .run();
    }
    return true;
  }

  list(options: { after: ListPosition | undefined; limit: number }): ReceiptWithImages[] {
    const { after } = options;
    const rows = this.#db
      .select()
      .from(receipts)
      .where(
        after &&
          or(
            lt(receipts.capturedAt, after.capturedAt),
            and(eq(receipts.capturedAt, after.capturedAt), lt(receipts.id, after.id)),
          ),
      )
      .orderBy(desc(receipts.capturedAt), desc(receipts.id))
      .limit(options.limit)
      .all();
    return this.#withImages(rows);
  }

  findImage(imageId: Id): ReceiptImage | undefined {
    const row = this.#db.select().from(receiptImages).where(eq(receiptImages.id, imageId)).get();
    return row && toImage(row);
  }

  #withImages(rows: readonly ReceiptRow[]): ReceiptWithImages[] {
    if (rows.length === 0) return [];
    const images = this.#db
      .select()
      .from(receiptImages)
      .where(
        inArray(
          receiptImages.receiptId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(receiptImages.receiptId), asc(receiptImages.position))
      .all();
    const byReceipt = Map.groupBy(images, (image) => image.receiptId);
    return rows.map((row) => ({
      receipt: toReceipt(row),
      images: (byReceipt.get(row.id) ?? []).map(toImage),
    }));
  }
}
