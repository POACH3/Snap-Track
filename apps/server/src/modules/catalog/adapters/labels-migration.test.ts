// Migration 0006 adds the classification tables with the default L1 categories (SPEC.md §5).
import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";

describe("migration 0006_labels", () => {
  it("adds the default L1 categories, in order, none archived", () => {
    const sqlite = createTestDatabase();
    const rows = sqlite
      .prepare("select name, level, parent_id, archived from categories order by sort_order")
      .all() as { name: string; level: number; parent_id: string | null; archived: number }[];
    expect(rows.map((row) => row.name)).toEqual([
      "Groceries",
      "Dining",
      "Household",
      "Personal Care",
      "Health",
      "Transportation",
      "Entertainment",
      "Clothing",
      "Kids",
      "Pets",
      "Gifts",
      "Other",
    ]);
    expect(rows.every((row) => row.level === 1 && row.parent_id === null && row.archived === 0)).toBe(true);
  });

  it("refuses a second L1 entry with the same name, ignoring case", () => {
    const sqlite = createTestDatabase();
    expect(() =>
      sqlite
        .prepare(
          "insert into categories (id, name, level, parent_id, sort_order, archived, created_at, updated_at) values ('x', 'groceries', 1, null, 99, 0, 'now', 'now')",
        )
        .run(),
    ).toThrow(/UNIQUE/);
  });
});
