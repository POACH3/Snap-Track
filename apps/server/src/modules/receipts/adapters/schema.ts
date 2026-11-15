import type { Payment, StoreEvidence, TaxLine, TransactionNumber } from "@snaptrack/contracts";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const receipts = sqliteTable(
  "receipts",
  {
    /** Made on the phone at capture time (SPEC.md §5). */
    id: text("id").primaryKey(),
    /** A `users` id. No foreign key: that table belongs to `auth` (SPEC.md §3.1 rule 4), and users are never deleted. */
    loggedByUserId: text("logged_by_user_id").notNull(),
    source: text("source", { enum: ["photo", "manual", "import"] }).notNull(),
    status: text("status", {
      enum: ["uploaded", "extracting", "unreviewed", "review_required", "confirmed"],
    }).notNull(),
    /** When the photo was taken on the device; ISO 8601 UTC, so text order is time order. */
    capturedAt: text("captured_at").notNull(),
    // Extracted data (SPEC.md §5, §6.3.2). All null until extraction, and wherever not printed.
    /** Local date as printed (`YYYY-MM-DD`), with `THH:MM` when a time was printed. */
    purchasedAt: text("purchased_at"),
    subtotalCents: integer("subtotal_cents"),
    /** Receipt-wide discounts only; item discounts are on the lines. */
    discountCents: integer("discount_cents"),
    taxCents: integer("tax_cents"),
    tipCents: integer("tip_cents"),
    totalCents: integer("total_cents"),
    printedSavingsCents: integer("printed_savings_cents"),
    printedItemCount: integer("printed_item_count"),
    taxLines: text("tax_lines", { mode: "json" }).$type<TaxLine[]>(),
    payments: text("payments", { mode: "json" }).$type<Payment[]>(),
    transactionNumbers: text("transaction_numbers", { mode: "json" }).$type<TransactionNumber[]>(),
    /** Word-for-word transcription of the whole receipt, nothing removed. */
    rawText: text("raw_text"),
    storeEvidence: text("store_evidence", { mode: "json" }).$type<StoreEvidence>(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("receipts_captured_at_id_idx").on(table.capturedAt, table.id),
    check("receipts_source_check", sql`${table.source} in ('photo', 'manual', 'import')`),
    check(
      "receipts_status_check",
      sql`${table.status} in ('uploaded', 'extracting', 'unreviewed', 'review_required', 'confirmed')`,
    ),
  ],
);

export const receiptImages = sqliteTable(
  "receipt_images",
  {
    id: text("id").primaryKey(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    /** Order on the receipt, top first, from 0. */
    position: integer("position").notNull(),
    /** FileStore keys; null once deleted under the retention rules (SPEC.md §6.8). */
    imageKey: text("image_key"),
    thumbnailKey: text("thumbnail_key"),
    /** Kept after the image is deleted, to catch the same photo uploaded twice. */
    imageSha256: text("image_sha256").notNull(),
    imageDeletedAt: text("image_deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("receipt_images_receipt_position_unique").on(table.receiptId, table.position),
    index("receipt_images_sha256_idx").on(table.imageSha256),
  ],
);

export const lineItems = sqliteTable(
  "line_items",
  {
    id: text("id").primaryKey(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    /** Order on the receipt, from 0. */
    position: integer("position").notNull(),
    kind: text("kind", { enum: ["item", "fee"] }).notNull(),
    /** Exactly as printed. */
    rawName: text("raw_name"),
    itemCode: text("item_code"),
    /** Integer thousandths of the unit: 2.31 lb is 2310. */
    quantityMilli: integer("quantity_milli").notNull(),
    unit: text("unit", { enum: ["each", "lb", "oz", "kg", "g", "gal", "l", "ml", "fl_oz"] }).notNull(),
    unitPriceCents: integer("unit_price_cents"),
    /** The amount actually charged, after any item discount. */
    lineTotalCents: integer("line_total_cents"),
    /** Savings on this line, already included in the line total. */
    discountCents: integer("discount_cents"),
    taxCode: text("tax_code"),
    /** The model's guess at a readable name; never applied on its own. */
    suggestedItemName: text("suggested_item_name"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("line_items_receipt_position_unique").on(table.receiptId, table.position),
    check("line_items_kind_check", sql`${table.kind} in ('item', 'fee')`),
  ],
);
