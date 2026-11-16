import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Companies where money is spent (SPEC.md §5). Locations are not tracked as separate stores. */
export const stores = sqliteTable(
  "stores",
  {
    id: text("id").primaryKey(),
    /** Unique ignoring case. */
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("stores_name_unique").on(sql`${table.name} collate nocase`)],
);

/** Every detail ever confirmed as belonging to a store: how stores are recognized (SPEC.md §5, §6.4). */
export const storeIdentifiers = sqliteTable(
  "store_identifiers",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    type: text("type", {
      enum: ["name", "legal_name", "logo_text", "phone", "website", "address"],
    }).notNull(),
    /** Normalized; what is looked up. */
    value: text("value").notNull(),
    /** As first printed, or as typed in the Library. */
    displayValue: text("display_value").notNull(),
    /** An ambiguous identifier is never used for automatic matching. */
    state: text("state", { enum: ["active", "ambiguous"] }).notNull(),
    /** A `receipts` id; null when added by hand. No foreign key: that table belongs to `receipts`. */
    firstReceiptId: text("first_receipt_id"),
    timesSeen: integer("times_seen").notNull(),
    lastSeenAt: text("last_seen_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    // One identifier can only ever point to one company.
    uniqueIndex("store_identifiers_type_value_unique").on(table.type, table.value),
    index("store_identifiers_store_idx").on(table.storeId),
    index("store_identifiers_value_idx").on(table.value),
    check(
      "store_identifiers_type_check",
      sql`${table.type} in ('name', 'legal_name', 'logo_text', 'phone', 'website', 'address')`,
    ),
    check("store_identifiers_state_check", sql`${table.state} in ('active', 'ambiguous')`),
  ],
);
