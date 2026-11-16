// Use-case tests for merges (SPEC.md §4.3 Merges; docs/feature-plans/catalog-merges-plan.md): the
// whole server on in-memory SQLite, so `catalog`'s rows and `receipts`' move together.
import { ExtractedReceipt, type ReceiptDetail, type StoreChoice } from "@snaptrack/contracts";
import { newId } from "@snaptrack/core";
import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { SqliteTransaction } from "../../../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { createTestApp } from "../../../testing/create-test-app.ts";
import { fakeImage } from "../../../testing/test-images.ts";
import { createCatalogModule } from "../../catalog/index.ts";
import { SqliteCatalogMergeListener } from "../adapters/sqlite-catalog-merge-listener.ts";
import { SqlitePurchaseLabelUsage } from "../adapters/sqlite-purchase-label-usage.ts";

let t: ReturnType<typeof createTestApp>;
let sam: string;

beforeEach(async () => {
  t = createTestApp();
  t.clock.set(new Date("2026-11-16T12:00:00.000Z"));
  const created = await t.auth.service.createUser({
    username: "sam",
    displayName: "Sam",
    password: "correct horse battery",
  });
  if (!created.ok) throw new Error("setup failed");
  sam = created.value.id;
});

const receipts = () => t.receipts.service;
const catalog = () => t.catalog.service;

async function extracted(reply: object): Promise<string> {
  const id = newId();
  const put = await receipts().putReceipt(
    {
      id,
      capturedAt: "2026-11-16T10:00:00Z",
      images: [fakeImage("jpeg", { width: 1000, height: 1800 }, id)],
    },
    sam,
  );
  if (!put.ok) throw new Error("upload failed");
  receipts().saveExtraction(id, ExtractedReceipt.parse(reply), []);
  t.clock.advance(1000);
  return id;
}

const detail = (id: string): ReceiptDetail => {
  const found = receipts().getReceipt(id);
  if (found === undefined) throw new Error(`no receipt ${id}`);
  return found;
};

type Lines = ReceiptDetail["draft"]["lines"];
function confirm(id: string, store: StoreChoice, change: (lines: Lines) => Lines = (l) => l) {
  const current = detail(id);
  const result = receipts().confirm(
    {
      id,
      expectedUpdatedAt: current.updatedAt,
      store,
      draft: { ...current.draft, lines: change(current.draft.lines) },
      answers: [],
    },
    sam,
  );
  t.clock.advance(1000);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.receipt;
}

const named =
  (name: string) =>
  (lines: Lines): Lines =>
    lines.map((line) => ({ ...line, item: { kind: "new" as const, name, categoryId: null, tagIds: [] } }));

const category = (name: string) => {
  const found = catalog()
    .listCategories()
    .find((c) => c.name === name);
  if (found === undefined) throw new Error(`no ${name}`);
  return found.id;
};
const added = (name: string, parentId: string | null) => {
  const result = catalog().addCategory(name, parentId);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.id;
};
const tag = (name: string) => {
  const result = catalog().addTag(name);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.id;
};

const martA = { printedName: "FRESH MART #12", phones: [{ number: "(555) 010-2000" }] };
const martB = { printedName: "FRESHMART 31", phones: [{ number: "(555) 010-3100" }] };

describe("merging items", () => {
  it("every line from both shows the kept item, whose identifiers still match", async () => {
    const first = await extracted({
      store: martA,
      total: 3.49,
      lines: [{ printedName: "WHOLE MILK GAL", itemCode: "4417", amount: 3.49 }],
    });
    const a = confirm(first, { kind: "new", name: "Fresh Mart" }, named("Whole milk"));
    const storeId = a.store?.id ?? "";
    const milk = a.draft.lines[0]?.itemRef?.id ?? "";
    const second = await extracted({
      store: martA,
      total: 3.49,
      lines: [{ printedName: "MILK 1GAL", itemCode: "9001", amount: 3.49 }],
    });
    const b = confirm(second, { kind: "existing", storeId }, named("Milk"));
    const dupe = b.draft.lines[0]?.itemRef?.id ?? "";
    catalog().setItemCategory(dupe, category("Groceries"));
    const breakfast = tag("breakfast");
    catalog().setItemTags(dupe, [breakfast]);

    const merged = catalog().mergeItems(dupe, milk);
    expect(merged.ok && merged.value).toMatchObject({
      item: { id: milk, name: "Whole milk" },
      categoryId: category("Groceries"),
      tagIds: [breakfast],
    });
    expect(catalog().itemDetail(dupe)).toBeUndefined();
    expect([detail(first), detail(second)].map((r) => r.draft.lines[0]?.itemRef?.name)).toEqual([
      "Whole milk",
      "Whole milk",
    ]);
    // The merged-away item's code now finds the kept item.
    const third = await extracted({
      store: martA,
      total: 3.49,
      lines: [{ printedName: "MILK", itemCode: "9001", amount: 3.49 }],
    });
    expect(detail(third).draft.lines[0]?.itemRef?.id).toBe(milk);
  });

  it("keeps the kept item's own category", async () => {
    const id = await extracted({
      store: martA,
      total: 2,
      lines: [
        { printedName: "A", amount: 1 },
        { printedName: "B", amount: 1 },
      ],
    });
    const done = confirm(id, { kind: "new", name: "Fresh Mart" }, (lines) =>
      lines.map((line, i) => ({
        ...line,
        item: { kind: "new" as const, name: i === 0 ? "Kept" : "Gone", categoryId: null, tagIds: [] },
      })),
    );
    const [kept, gone] = done.draft.lines.map((line) => line.itemRef?.id ?? "");
    catalog().setItemCategory(kept ?? "", category("Dining"));
    catalog().setItemCategory(gone ?? "", category("Groceries"));
    const merged = catalog().mergeItems(gone ?? "", kept ?? "");
    expect(merged.ok && merged.value.categoryId).toBe(category("Dining"));
  });
});

describe("merging stores", () => {
  it("moves receipts and identifiers, so either store's details match the kept one", async () => {
    const first = await extracted({ store: martA, total: 1 });
    const kept = confirm(first, { kind: "new", name: "Fresh Mart" }).store?.id ?? "";
    const second = await extracted({ store: martB, total: 1 });
    const gone = confirm(second, { kind: "new", name: "FreshMart 31" }).store?.id ?? "";
    catalog().setStoreDefaultCategory(gone, category("Groceries"));

    const merged = catalog().mergeStores(gone, kept);
    expect(merged.ok && merged.value).toMatchObject({
      store: { id: kept, name: "Fresh Mart" },
      defaultCategoryId: category("Groceries"),
    });
    expect(catalog().findStore(gone)).toBeUndefined();
    expect(detail(second).store?.id).toBe(kept);
    const next = await extracted({ store: martB, total: 2 });
    expect(detail(next).store?.id).toBe(kept);
  });

  it("an item code saved at both stores for different items stops matching", async () => {
    const line = { printedName: "SODA", itemCode: "555", amount: 1 };
    const first = await extracted({ store: martA, total: 1, lines: [line] });
    const kept = confirm(first, { kind: "new", name: "Fresh Mart" }, named("Cola")).store?.id ?? "";
    const second = await extracted({ store: martB, total: 1, lines: [line] });
    const gone = confirm(second, { kind: "new", name: "FreshMart 31" }, named("Lemonade")).store?.id ?? "";
    catalog().mergeStores(gone, kept);
    const next = await extracted({ store: martA, total: 1, lines: [{ ...line, printedName: "SODA 2L" }] });
    expect(detail(next).draft.lines[0]?.itemRef).toBeNull();
  });
});

describe("merging categories and tags", () => {
  it("moves children (same names merging), items, store defaults, lines and guesses, on the same level only", async () => {
    const food = added("Food", null);
    const foodDairy = added("Dairy", food);
    const foodCheese = added("Cheese", foodDairy);
    const groceriesDairy = added("Dairy", category("Groceries"));
    const id = await extracted({
      store: martA,
      total: 2,
      lines: [
        { printedName: "A", amount: 1 },
        { printedName: "B", amount: 1 },
      ],
    });
    const done = confirm(id, { kind: "new", name: "Fresh Mart" }, (lines) =>
      lines.map((line, i) => ({ ...line, categoryId: i === 0 ? foodCheese : food })),
    );
    catalog().setStoreDefaultCategory(done.store?.id ?? "", food);

    expect(catalog().mergeCategories(foodDairy, category("Groceries"))).toEqual({
      ok: false,
      error: { kind: "different-level" },
    });
    expect(catalog().mergeCategories(food, category("Groceries")).ok).toBe(true);
    const paths = catalog()
      .labelChoices()
      .categories.map((c) => c.path);
    expect(paths).toContain("Groceries › Dairy › Cheese");
    expect(paths.filter((p) => p === "Groceries › Dairy")).toHaveLength(1);
    expect(paths.some((p) => p.startsWith("Food"))).toBe(false);
    expect(detail(id).draft.lines.map((l) => l.categoryId)).toEqual([foodCheese, category("Groceries")]);
    expect(catalog().storeDefaultCategory(done.store?.id ?? "")).toBe(category("Groceries"));
    expect(
      catalog()
        .listCategories()
        .some((c) => c.id === groceriesDairy),
    ).toBe(true);
  });

  it("tags combine on items and lines without repeats", async () => {
    const treat = tag("treat");
    const dessert = tag("dessert");
    const id = await extracted({ store: martA, total: 1, lines: [{ printedName: "CAKE", amount: 1 }] });
    const done = confirm(id, { kind: "new", name: "Fresh Mart" }, (lines) =>
      named("Cake")(lines).map((line) => ({ ...line, tagIds: [treat, dessert] })),
    );
    const cake = done.draft.lines[0]?.itemRef?.id ?? "";
    catalog().setItemTags(cake, [treat]);
    expect(catalog().mergeTags(treat, dessert).ok).toBe(true);
    expect(catalog().itemLabels([cake]).get(cake)?.tagIds).toEqual([dessert]);
    expect(detail(id).draft.lines[0]?.tagIds).toEqual([dessert]);
    expect(
      catalog()
        .listTags()
        .map((t) => t.name),
    ).toEqual(["dessert"]);
  });

  it("refuses merging into itself or into something missing", () => {
    const groceries = category("Groceries");
    expect(catalog().mergeCategories(groceries, groceries)).toEqual({ ok: false, error: { kind: "same" } });
    expect(catalog().mergeCategories(groceries, newId())).toEqual({
      ok: false,
      error: { kind: "not-found" },
    });
    expect(catalog().mergeStores(newId(), newId())).toEqual({ ok: false, error: { kind: "not-found" } });
  });
});

describe("a merge that fails partway", () => {
  it("changes nothing", () => {
    const sqlite = createTestDatabase();
    const db = toDrizzle(sqlite);
    const clock = new FakeClock(new Date("2026-11-16T12:00:00.000Z"));
    const real = new SqliteCatalogMergeListener(db);
    const failing = {
      storesMerged: real.storesMerged.bind(real),
      itemsMerged: real.itemsMerged.bind(real),
      tagsMerged: real.tagsMerged.bind(real),
      categoriesMerged: () => {
        throw new Error("receipts failed");
      },
    };
    const service = createCatalogModule({
      db,
      clock,
      transaction: new SqliteTransaction(sqlite),
      usage: new SqlitePurchaseLabelUsage(db),
      mergeListener: failing,
    }).service;
    const food = service.addCategory("Food", null);
    if (!food.ok) throw new Error("setup failed");
    const child = service.addCategory("Snacks", food.value.id);
    const before = service.listCategories();
    const groceries = before.find((c) => c.name === "Groceries")?.id ?? "";
    expect(() => service.mergeCategories(food.value.id, groceries)).toThrow("receipts failed");
    expect(service.listCategories()).toEqual(before);
    expect(child.ok && service.listCategories().find((c) => c.id === child.value.id)?.parentId).toBe(
      food.value.id,
    );
  });
});
