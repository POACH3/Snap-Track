import type { ReceiptStatus, StoreEvidence } from "@snaptrack/contracts";
import { newId, type Clock, type Id } from "@snaptrack/core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { pairKey, type DuplicateFacts } from "../domain/duplicates.ts";
import type { ExtractionResult, LineItem } from "../domain/extracted-data.ts";
import type { ListPosition } from "../domain/list-cursor.ts";
import type {
  LineGuess,
  LineLabels,
  NewReceipt,
  Receipt,
  ReceiptImage,
  ReceiptRecord,
  ReceiptWithImages,
  StoredLine,
} from "../domain/receipt.ts";
import { EMPTY_EVIDENCE } from "../domain/review.ts";
import type { ItemPurchase, ReceiptRepository, ReceiptStore, Review } from "../ports.ts";
import { duplicateDismissals, lineItems, lineItemTags, receiptImages, receipts } from "./schema.ts";

type Db = BetterSQLite3Database;
type ReceiptRow = typeof receipts.$inferSelect;
type ImageRow = typeof receiptImages.$inferSelect;
type LineRow = typeof lineItems.$inferSelect;

/**
 * The sum of a receipt's known line totals; null when none is known (SQL `sum` skips nulls).
 * Columns are named in full, since inside the subquery a bare `id` would be the line's.
 */
const linesTotal = sql<
  number | null
>`(select sum("line_items"."line_total_cents") from "line_items" where "line_items"."receipt_id" = "receipts"."id")`;

const toReceipt = (row: ReceiptRow, linesTotalCents: number | null): Receipt => ({
  id: row.id,
  loggedByUserId: row.loggedByUserId,
  source: row.source,
  status: row.status,
  capturedAt: row.capturedAt,
  purchasedAt: row.purchasedAt,
  totalCents: row.totalCents,
  linesTotalCents,
  discountCents: row.discountCents,
  taxCents: row.taxCents,
  tipCents: row.tipCents,
  storeId: row.storeId,
});

const toImage = (row: ImageRow): ReceiptImage => ({
  id: row.id,
  receiptId: row.receiptId,
  position: row.position,
  imageKey: row.imageKey,
  thumbnailKey: row.thumbnailKey,
  imageSha256: row.imageSha256,
});

const toLine = (row: LineRow, tagIds: readonly Id[]): StoredLine => ({
  id: row.id,
  position: row.position,
  kind: row.kind,
  rawName: row.rawName,
  itemCode: row.itemCode,
  quantityMilli: row.quantityMilli,
  unit: row.unit,
  unitPriceCents: row.unitPriceCents,
  lineTotalCents: row.lineTotalCents,
  discountCents: row.discountCents,
  taxCode: row.taxCode,
  suggestedItemName: row.suggestedItemName,
  itemId: row.itemId,
  lineCategoryId: row.lineCategoryId,
  tagIds,
  suggestionOutcome: row.suggestionOutcome,
  suggestedCategoryId: row.suggestedCategoryId,
  suggestedTagIds: row.suggestedTagIds ?? [],
});

/** A line's columns, apart from its id, receipt, guesses and timestamps. */
const lineColumns = (line: Omit<LineItem, "suggestedItemName"> & LineLabels & { itemId: Id | null }) => ({
  itemId: line.itemId,
  lineCategoryId: line.lineCategoryId,
  suggestionOutcome: line.suggestionOutcome,
  position: line.position,
  kind: line.kind,
  rawName: line.rawName,
  itemCode: line.itemCode,
  quantityMilli: line.quantityMilli,
  unit: line.unit,
  unitPriceCents: line.unitPriceCents,
  lineTotalCents: line.lineTotalCents,
  discountCents: line.discountCents,
  taxCode: line.taxCode,
});

const storeColumns = (store: ReceiptStore | undefined) => ({
  storeId: store?.storeId ?? null,
  storeMatchedBy: store?.matchedBy ?? null,
  storeMatch: store?.match ?? null,
});

export class SqliteReceiptRepository implements ReceiptRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  findById(id: Id): ReceiptWithImages | undefined {
    const row = this.#db
      .select({ row: receipts, linesTotal })
      .from(receipts)
      .where(eq(receipts.id, id))
      .get();
    return row && this.#withImages([row])[0];
  }

  findRecord(id: Id): ReceiptRecord | undefined {
    const found = this.#db
      .select({ row: receipts, linesTotal })
      .from(receipts)
      .where(eq(receipts.id, id))
      .get();
    const withImages = found && this.#withImages([found])[0];
    if (found === undefined || withImages === undefined) return undefined;
    const { row } = found;
    const lines = this.#db
      .select()
      .from(lineItems)
      .where(eq(lineItems.receiptId, id))
      .orderBy(asc(lineItems.position))
      .all();
    const tagsByLine = this.#tagsOf(lines.map((line) => line.id));
    return {
      ...withImages,
      data: {
        purchasedAt: row.purchasedAt,
        subtotalCents: row.subtotalCents,
        discountCents: row.discountCents,
        taxCents: row.taxCents,
        tipCents: row.tipCents,
        totalCents: row.totalCents,
        printedSavingsCents: row.printedSavingsCents,
        printedItemCount: row.printedItemCount,
        taxLines: row.taxLines ?? [],
        payments: row.payments ?? [],
        transactionNumbers: row.transactionNumbers ?? [],
        rawText: row.rawText,
        storeEvidence: row.storeEvidence ?? EMPTY_EVIDENCE,
      },
      lines: lines.map((line) => toLine(line, tagsByLine.get(line.id) ?? [])),
      storeMatchedBy: row.storeMatchedBy,
      storeMatch: row.storeMatch,
      note: row.note,
      confirmedByUserId: row.confirmedByUserId,
      confirmedAt: row.confirmedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  insert(receipt: NewReceipt, images: readonly ReceiptImage[]): boolean {
    const now = this.#clock.now().toISOString();
    const result = this.#db
      .insert(receipts)
      .values({
        id: receipt.id,
        loggedByUserId: receipt.loggedByUserId,
        source: receipt.source,
        status: receipt.status,
        capturedAt: receipt.capturedAt,
        createdAt: now,
        updatedAt: now,
      })
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

  list(options: {
    after: ListPosition | undefined;
    limit: number;
    status?: "unreviewed" | "review_required" | undefined;
  }): ReceiptWithImages[] {
    const { after } = options;
    const rows = this.#db
      .select({ row: receipts, linesTotal })
      .from(receipts)
      .where(
        and(
          after &&
            or(
              lt(receipts.capturedAt, after.capturedAt),
              and(eq(receipts.capturedAt, after.capturedAt), lt(receipts.id, after.id)),
            ),
          options.status && eq(receipts.status, options.status),
        ),
      )
      .orderBy(desc(receipts.capturedAt), desc(receipts.id))
      .limit(options.limit)
      .all();
    return this.#withImages(rows);
  }

  setStatus(id: Id, status: ReceiptStatus, from: readonly ReceiptStatus[]): boolean {
    const result = this.#db
      .update(receipts)
      .set({ status, updatedAt: this.#clock.now().toISOString() })
      .where(and(eq(receipts.id, id), inArray(receipts.status, [...from])))
      .run();
    return result.changes === 1;
  }

  #tagsOf(lineIds: readonly Id[]): Map<Id, Id[]> {
    if (lineIds.length === 0) return new Map();
    const rows = this.#db
      .select({ lineId: lineItemTags.lineItemId, tagId: lineItemTags.tagId })
      .from(lineItemTags)
      .where(inArray(lineItemTags.lineItemId, [...lineIds]))
      .all();
    const byLine = new Map<Id, Id[]>();
    for (const { lineId, tagId } of rows) byLine.set(lineId, [...(byLine.get(lineId) ?? []), tagId]);
    return byLine;
  }

  #setTags(lineId: Id, tagIds: readonly Id[]): void {
    this.#db.delete(lineItemTags).where(eq(lineItemTags.lineItemId, lineId)).run();
    const unique = [...new Set(tagIds)];
    if (unique.length > 0)
      this.#db
        .insert(lineItemTags)
        .values(unique.map((tagId) => ({ lineItemId: lineId, tagId })))
        .run();
  }

  saveExtraction(
    id: Id,
    result: ExtractionResult,
    status: ReceiptStatus,
    store: ReceiptStore | undefined,
    itemIds: readonly (Id | null)[],
    guesses: readonly LineGuess[],
  ): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .update(receipts)
      .set({ ...result.data, ...storeColumns(store), status, updatedAt: now })
      .where(eq(receipts.id, id))
      .run();
    this.#db.delete(lineItems).where(eq(lineItems.receiptId, id)).run();
    if (result.lines.length > 0) {
      this.#db
        .insert(lineItems)
        .values(
          result.lines.map((line, index) => ({
            ...line,
            itemId: itemIds[index] ?? null,
            suggestedCategoryId: guesses[index]?.suggestedCategoryId ?? null,
            suggestedTagIds: [...(guesses[index]?.suggestedTagIds ?? [])],
            id: newId(),
            receiptId: id,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .run();
    }
  }

  saveReview(id: Id, review: Review): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .update(receipts)
      .set({
        ...review.data,
        ...storeColumns(review.store),
        note: review.note,
        status: "confirmed",
        confirmedByUserId: review.confirmedByUserId,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(receipts.id, id))
      .run();

    const existing = new Set(
      this.#db
        .select({ id: lineItems.id })
        .from(lineItems)
        .where(eq(lineItems.receiptId, id))
        .all()
        .map((row) => row.id),
    );
    const kept = review.lines.flatMap((line) =>
      line.id !== undefined && existing.has(line.id) ? [line.id] : [],
    );
    this.#db
      .delete(lineItems)
      .where(and(eq(lineItems.receiptId, id), kept.length === 0 ? undefined : notInArray(lineItems.id, kept)))
      .run();
    // Positions are unique per receipt, so kept lines step out of the way before taking their new places.
    if (kept.length > 0) {
      this.#db
        .update(lineItems)
        .set({ position: sql`-1 - ${lineItems.position}` })
        .where(eq(lineItems.receiptId, id))
        .run();
    }
    for (const line of review.lines) {
      let lineId: Id;
      if (line.id !== undefined && existing.has(line.id)) {
        lineId = line.id;
        this.#db
          .update(lineItems)
          .set({ ...lineColumns(line), updatedAt: now })
          .where(eq(lineItems.id, line.id))
          .run();
      } else {
        lineId = newId();
        this.#db
          .insert(lineItems)
          .values({
            ...lineColumns(line),
            id: lineId,
            receiptId: id,
            suggestedItemName: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
      this.#setTags(lineId, line.tagIds);
    }
  }

  countWaiting(): { unreviewed: number; reviewRequired: number } {
    const rows = this.#db
      .select({ status: receipts.status, n: count() })
      .from(receipts)
      .where(inArray(receipts.status, ["unreviewed", "review_required"]))
      .groupBy(receipts.status)
      .all();
    const of = (status: string) => rows.find((row) => row.status === status)?.n ?? 0;
    return { unreviewed: of("unreviewed"), reviewRequired: of("review_required") };
  }

  listUnidentified(): { id: Id; evidence: StoreEvidence }[] {
    return this.#db
      .select({ id: receipts.id, evidence: receipts.storeEvidence })
      .from(receipts)
      .where(
        and(isNull(receipts.storeId), ne(receipts.status, "confirmed"), isNotNull(receipts.storeEvidence)),
      )
      .all()
      .flatMap((row) => (row.evidence === null ? [] : [{ id: row.id, evidence: row.evidence }]));
  }

  setIdentifiedStore(id: Id, store: ReceiptStore): boolean {
    const result = this.#db
      .update(receipts)
      .set({ ...storeColumns(store), updatedAt: this.#clock.now().toISOString() })
      .where(and(eq(receipts.id, id), isNull(receipts.storeId), ne(receipts.status, "confirmed")))
      .run();
    return result.changes === 1;
  }

  listLinesWithoutItem(): {
    receiptId: Id;
    storeId: Id | null;
    lines: { id: Id; kind: "item" | "fee"; rawName: string | null; itemCode: string | null }[];
  }[] {
    const rows = this.#db
      .select({
        receiptId: lineItems.receiptId,
        storeId: receipts.storeId,
        id: lineItems.id,
        kind: lineItems.kind,
        rawName: lineItems.rawName,
        itemCode: lineItems.itemCode,
      })
      .from(lineItems)
      .innerJoin(receipts, eq(receipts.id, lineItems.receiptId))
      .where(
        and(
          isNull(lineItems.itemId),
          inArray(receipts.status, ["unreviewed", "review_required", "confirmed"]),
        ),
      )
      .orderBy(asc(lineItems.receiptId), asc(lineItems.position))
      .all();
    return [...Map.groupBy(rows, (row) => row.receiptId)].map(([receiptId, lines]) => ({
      receiptId,
      storeId: lines[0]?.storeId ?? null,
      lines: lines.map(({ id, kind, rawName, itemCode }) => ({ id, kind, rawName, itemCode })),
    }));
  }

  setLineItem(lineId: Id, itemId: Id): boolean {
    const now = this.#clock.now().toISOString();
    const result = this.#db
      .update(lineItems)
      .set({ itemId, updatedAt: now })
      .where(and(eq(lineItems.id, lineId), isNull(lineItems.itemId)))
      .run();
    return result.changes === 1;
  }

  itemPurchases(itemId: Id, limit: number): ItemPurchase[] {
    return this.#db
      .select({
        receiptId: receipts.id,
        purchasedAt: receipts.purchasedAt,
        capturedAt: receipts.capturedAt,
        storeId: receipts.storeId,
        lineTotalCents: lineItems.lineTotalCents,
        quantityMilli: lineItems.quantityMilli,
        unit: lineItems.unit,
      })
      .from(lineItems)
      .innerJoin(receipts, eq(receipts.id, lineItems.receiptId))
      .where(eq(lineItems.itemId, itemId))
      .orderBy(desc(sql`coalesce(${receipts.purchasedAt}, ${receipts.capturedAt})`), desc(receipts.id))
      .limit(limit)
      .all();
  }

  findImage(imageId: Id): ReceiptImage | undefined {
    const row = this.#db.select().from(receiptImages).where(eq(receiptImages.id, imageId)).get();
    return row && toImage(row);
  }

  #withImages(rows: readonly { row: ReceiptRow; linesTotal: number | null }[]): ReceiptWithImages[] {
    if (rows.length === 0) return [];
    const images = this.#db
      .select()
      .from(receiptImages)
      .where(
        inArray(
          receiptImages.receiptId,
          rows.map(({ row }) => row.id),
        ),
      )
      .orderBy(asc(receiptImages.receiptId), asc(receiptImages.position))
      .all();
    const byReceipt = Map.groupBy(images, (image) => image.receiptId);
    return rows.map(({ row, linesTotal: total }) => ({
      receipt: toReceipt(row, total),
      images: (byReceipt.get(row.id) ?? []).map(toImage),
    }));
  }

  duplicateCandidates(storeId: Id | null, hashes: readonly string[]): DuplicateFacts[] {
    const byHash =
      hashes.length === 0
        ? []
        : this.#db
            .selectDistinct({ id: receiptImages.receiptId })
            .from(receiptImages)
            .where(inArray(receiptImages.imageSha256, [...hashes]))
            .all()
            .map((row) => row.id);
    const where =
      storeId === null
        ? byHash.length === 0
          ? undefined
          : inArray(receipts.id, byHash)
        : byHash.length === 0
          ? eq(receipts.storeId, storeId)
          : or(eq(receipts.storeId, storeId), inArray(receipts.id, byHash));
    if (where === undefined) return [];
    const rows = this.#db
      .select({
        id: receipts.id,
        storeId: receipts.storeId,
        purchasedAt: receipts.purchasedAt,
        totalCents: receipts.totalCents,
        transactionNumbers: receipts.transactionNumbers,
        payments: receipts.payments,
      })
      .from(receipts)
      .where(where)
      .all();
    if (rows.length === 0) return [];
    const images = this.#db
      .select({ receiptId: receiptImages.receiptId, hash: receiptImages.imageSha256 })
      .from(receiptImages)
      .where(
        inArray(
          receiptImages.receiptId,
          rows.map((row) => row.id),
        ),
      )
      .all();
    const hashesOf = new Map<Id, string[]>();
    for (const { receiptId, hash } of images)
      hashesOf.set(receiptId, [...(hashesOf.get(receiptId) ?? []), hash]);
    return rows.map((row) => ({
      ...row,
      transactionNumbers: row.transactionNumbers ?? [],
      payments: row.payments ?? [],
      imageHashes: hashesOf.get(row.id) ?? [],
    }));
  }

  dismissedWith(id: Id): Set<Id> {
    const rows = this.#db
      .select({ a: duplicateDismissals.receiptId, b: duplicateDismissals.otherReceiptId })
      .from(duplicateDismissals)
      .where(or(eq(duplicateDismissals.receiptId, id), eq(duplicateDismissals.otherReceiptId, id)))
      .all();
    return new Set(rows.map(({ a, b }) => (a === id ? b : a)));
  }

  dismissDuplicate(id: Id, otherId: Id, userId: Id): void {
    const [receiptId, otherReceiptId] = pairKey(id, otherId);
    this.#db
      .insert(duplicateDismissals)
      .values({
        receiptId,
        otherReceiptId,
        dismissedByUserId: userId,
        dismissedAt: this.#clock.now().toISOString(),
      })
      .onConflictDoNothing()
      .run();
  }

  delete(id: Id): string[] | undefined {
    const images = this.#db
      .select({ image: receiptImages.imageKey, thumbnail: receiptImages.thumbnailKey })
      .from(receiptImages)
      .where(eq(receiptImages.receiptId, id))
      .all();
    // Lines, their tags, images and dismissals go with it (each references the receipt, on delete cascade).
    const result = this.#db.delete(receipts).where(eq(receipts.id, id)).run();
    if (result.changes === 0) return undefined;
    return images.flatMap(({ image, thumbnail }) =>
      [image, thumbnail].filter((key): key is string => key !== null),
    );
  }
}
