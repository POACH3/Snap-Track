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
