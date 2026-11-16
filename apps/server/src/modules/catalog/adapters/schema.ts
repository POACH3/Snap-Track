import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * The classification hierarchy, every level in one table (SPEC.md §5). The default L1 set is
 * added by migration 0006.
 */
export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** 1–4: category, subcategory, class, class. */
    level: integer("level").notNull(),
    /** Exactly one level up; null for L1. */
    parentId: text("parent_id").references((): AnySQLiteColumn => categories.id),
    /** Chosen with the chart library in Stage 6; null until then. */
    color: text("color"),
    sortOrder: integer("sort_order").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("categories_parent_name_unique").on(table.parentId, sql`${table.name} collate nocase`),
    // SQLite treats every null as different, so L1 names need their own unique index.
    uniqueIndex("categories_top_name_unique")
      .on(sql`${table.name} collate nocase`)
      .where(sql`${table.parentId} is null`),
    index("categories_parent_idx").on(table.parentId),
    check("categories_level_check", sql`${table.level} between 1 and 4`),
    check("categories_parent_check", sql`(${table.level} = 1) = (${table.parentId} is null)`),
  ],
);

/** Free tags: labels for filtering, outside the hierarchy (SPEC.md §5). */
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color"),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("tags_name_unique").on(sql`${table.name} collate nocase`)],
);

/** Companies where money is spent (SPEC.md §5). Locations are not tracked as separate stores. */
export const stores = sqliteTable(
  "stores",
  {
    id: text("id").primaryKey(),
    /** Unique ignoring case. */
    name: text("name").notNull(),
    /** "What I usually buy here"; set by a person only. */
    defaultCategoryId: text("default_category_id").references(() => categories.id),
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

/** One row per real-world product (SPEC.md §5). Created only by a person. */
export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    /** Shown everywhere. Not unique: two products may share a name. */
    name: text("name").notNull(),
    nameSource: text("name_source", { enum: ["printed", "model", "user"] }).notNull(),
    /** Set by a person only; applies to every purchase of the item. */
    categoryId: text("category_id").references(() => categories.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("items_name_idx").on(sql`${table.name} collate nocase`),
    check("items_name_source_check", sql`${table.nameSource} in ('printed', 'model', 'user')`),
  ],
);

/** Details confirmed as belonging to an item (SPEC.md §5, §6.4 step 2). */
export const itemIdentifiers = sqliteTable(
  "item_identifiers",
  {
    id: text("id").primaryKey(),
    /** Null for a barcode, which matches at any company. */
    storeId: text("store_id").references(() => stores.id),
    type: text("type", { enum: ["barcode", "code", "name"] }).notNull(),
    /** Normalized; what is looked up. */
    value: text("value").notNull(),
    /** As first printed. */
    displayValue: text("display_value").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    /** An ambiguous identifier is never used for automatic matching. */
    state: text("state", { enum: ["active", "ambiguous"] }).notNull(),
    /** A `receipts` id. No foreign key: that table belongs to `receipts`. */
    firstReceiptId: text("first_receipt_id"),
    timesSeen: integer("times_seen").notNull(),
    lastSeenAt: text("last_seen_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("item_identifiers_store_type_value_unique").on(table.storeId, table.type, table.value),
    // SQLite treats every null as different, so barcodes (no store) need their own unique index (SPEC.md §5).
    uniqueIndex("item_identifiers_barcode_unique")
      .on(table.type, table.value)
      .where(sql`${table.storeId} is null`),
    index("item_identifiers_item_idx").on(table.itemId),
    index("item_identifiers_value_idx").on(table.value),
    check("item_identifiers_type_check", sql`${table.type} in ('barcode', 'code', 'name')`),
    check("item_identifiers_state_check", sql`${table.state} in ('active', 'ambiguous')`),
    check(
      "item_identifiers_barcode_store_check",
      sql`(${table.type} = 'barcode') = (${table.storeId} is null)`,
    ),
  ],
);

/** Tags on an item: they apply to every purchase of it (SPEC.md §5). */
export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index("item_tags_tag_idx").on(table.tagId),
  ],
);
