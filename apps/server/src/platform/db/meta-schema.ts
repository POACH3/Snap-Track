import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Facts about the database itself, as key/value pairs. Owned by the platform, not a module. */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
