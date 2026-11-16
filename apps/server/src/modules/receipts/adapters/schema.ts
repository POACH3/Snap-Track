import type { Payment, StoreEvidence, StoreMatch, TaxLine, TransactionNumber } from "@snaptrack/contracts";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    /** A `stores` id; null until identified or chosen. No foreign key: that table belongs to `catalog`. */
    storeId: text("store_id"),
    storeMatchedBy: text("store_matched_by", { enum: ["identifier", "user", "import_format"] }),
    /** What made an automatic match; null unless matched by identifier. */
    storeMatch: text("store_match", { mode: "json" }).$type<StoreMatch>(),
    note: text("note"),
    /** A `users` id. */
    confirmedByUserId: text("confirmed_by_user_id"),
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("receipts_captured_at_id_idx").on(table.capturedAt, table.id),
    index("receipts_store_idx").on(table.storeId),
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
    /** An `items` id; null until matched or chosen. No foreign key: that table belongs to `catalog`. */
    itemId: text("item_id"),
    /** "This purchase only": a `categories` id set by a person on this line alone. No foreign key: `catalog`'s table. */
    lineCategoryId: text("line_category_id"),
    /** The model's guesses, never applied on their own (SPEC.md §5). `categories` and `tags` ids. */
    suggestedCategoryId: text("suggested_category_id"),
    suggestedTagIds: text("suggested_tag_ids", { mode: "json" }).$type<string[]>(),
    /** What a person did with the guess; null until then (SPEC.md §6.7). */
    suggestionOutcome: text("suggestion_outcome", { enum: ["accepted", "dismissed"] }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("line_items_receipt_position_unique").on(table.receiptId, table.position),
    index("line_items_item_idx").on(table.itemId),
    index("line_items_line_category_idx").on(table.lineCategoryId),
    // No check on `suggestion_outcome`: adding one would make the migration rebuild this table.
    check("line_items_kind_check", sql`${table.kind} in ('item', 'fee')`),
  ],
);

/** Tags on a single purchase only (SPEC.md §5). `tag_id` is a `tags` id; no foreign key: `catalog`'s table. */
export const lineItemTags = sqliteTable(
  "line_item_tags",
  {
    lineItemId: text("line_item_id")
      .notNull()
      .references(() => lineItems.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.lineItemId, table.tagId] }),
    index("line_item_tags_tag_idx").on(table.tagId),
  ],
);
