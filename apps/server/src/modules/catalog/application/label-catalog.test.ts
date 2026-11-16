// Use-case tests for editing the hierarchy and tags (SPEC.md §5): real SQLite in memory.
import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { SqliteTransaction } from "../../../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { createCatalogModule } from "../adapters/catalog-module.ts";
import { noReceipts, unusedLabels } from "../testing/unused-labels.ts";
import type { CatalogService } from "./catalog-service.ts";

let catalog: CatalogService;

beforeEach(() => {
  const sqlite = createTestDatabase();
  catalog = createCatalogModule({
    db: toDrizzle(sqlite),
    clock: new FakeClock(new Date("2026-11-15T12:00:00.000Z")),
    transaction: new SqliteTransaction(sqlite),
    usage: unusedLabels,
    mergeListener: noReceipts,
  }).service;
});

const id = (name: string) => {
  const found = catalog.listCategories().find((c) => c.name === name);
  if (found === undefined) throw new Error(`no ${name}`);
  return found.id;
};
const add = (name: string, parentId: string | null) => {
  const result = catalog.addCategory(name, parentId);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
};

describe("the hierarchy", () => {
  it("adds entries one level below their parent, at most four deep", () => {
    const frozen = add("Frozen foods", id("Groceries"));
    const iceCream = add("Ice cream", frozen.id);
    const premium = add("Premium ice cream", iceCream.id);
    expect([frozen.level, iceCream.level, premium.level]).toEqual([2, 3, 4]);
    expect(catalog.addCategory("Too deep", premium.id)).toEqual({ ok: false, error: { kind: "too-deep" } });
    expect(add("Hobbies", null).level).toBe(1);
  });

  it("keeps names unique among siblings, L1 included, but not across parents", () => {
    expect(catalog.addCategory("groceries", null)).toEqual({ ok: false, error: { kind: "name-taken" } });
    add("Snacks", id("Groceries"));
    expect(catalog.addCategory("SNACKS", id("Groceries")).ok).toBe(false);
    expect(catalog.addCategory("Snacks", id("Entertainment")).ok).toBe(true);
    expect(catalog.renameCategory(id("Dining"), "Groceries").ok).toBe(false);
  });

  it("moves an entry under a parent one level up only, taking its children along", () => {
    const frozen = add("Frozen foods", id("Groceries"));
    const iceCream = add("Ice cream", frozen.id);
    const treats = add("Treats", id("Entertainment"));
    expect(catalog.moveCategory(iceCream.id, id("Groceries"))).toEqual({
      ok: false,
      error: { kind: "invalid-parent" },
    });
    add("Premium", iceCream.id);
    expect(catalog.moveCategory(iceCream.id, treats.id).ok).toBe(true);
    const paths = catalog.labelChoices().categories.map((c) => c.path);
    expect(paths).toContain("Entertainment › Treats › Ice cream › Premium");
    expect(catalog.moveCategory(id("Dining"), id("Groceries")).ok).toBe(false);
  });

  it("lists parents before their children", () => {
    const dairy = add("Dairy", id("Groceries"));
    add("Milk", dairy.id);
    const names = catalog.listCategories().map((c) => c.name);
    expect(names.slice(0, 3)).toEqual(["Groceries", "Dairy", "Milk"]);
  });
});

describe("tags", () => {
  it("are unique ignoring case, and an unused one is deleted on removal", () => {
    const result = catalog.addTag("Luxury item");
    if (!result.ok) throw new Error("not added");
    expect(catalog.addTag("luxury ITEM").ok).toBe(false);
    expect(catalog.removeTag(result.value.id)).toEqual({ ok: true, value: "deleted" });
    expect(catalog.listTags()).toEqual([]);
  });
});
