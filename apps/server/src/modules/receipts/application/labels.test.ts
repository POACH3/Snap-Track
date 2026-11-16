// Use-case tests for categories and tags on purchases (SPEC.md §5 Classification rules, §6.5,
// §6.7; docs/feature-plans/categories-and-tags-plan.md): real SQLite in memory with the real
// catalog module, fakes for files, images and clock.
import { SqliteCatalogMergeListener } from "../adapters/sqlite-catalog-merge-listener.ts";
import { ExtractedReceipt, type ReceiptDetail, type StoreChoice } from "@snaptrack/contracts";
import { newId } from "@snaptrack/core";
import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { SqliteTransaction } from "../../../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { createCatalogModule, type CatalogService } from "../../catalog/index.ts";
import { SqlitePurchaseLabelUsage } from "../adapters/sqlite-purchase-label-usage.ts";
import { SqliteReceiptRepository } from "../adapters/sqlite-receipt-repository.ts";
import type { LineGuess } from "../domain/receipt.ts";
import { FakeImageConverter } from "../testing/fake-image-converter.ts";
import { fakeImage } from "../testing/fake-images.ts";
import { InMemoryFileStore } from "../testing/in-memory-file-store.ts";
import { createReceiptsService, type ReceiptsService } from "./receipts-service.ts";

const SAM = "11111111-1111-4111-8111-111111111111";

let clock: FakeClock;
let catalog: CatalogService;
let service: ReceiptsService;

beforeEach(() => {
  const sqlite = createTestDatabase();
  const db = toDrizzle(sqlite);
  clock = new FakeClock(new Date("2026-11-15T12:00:00.000Z"));
  const transaction = new SqliteTransaction(sqlite);
  catalog = createCatalogModule({
    db,
    clock,
    transaction,
    usage: new SqlitePurchaseLabelUsage(db),
    mergeListener: new SqliteCatalogMergeListener(db),
  }).service;
  service = createReceiptsService({
    receipts: new SqliteReceiptRepository(db, clock),
    files: new InMemoryFileStore(),
    converter: new FakeImageConverter(),
    users: { displayNames: () => new Map([[SAM, "Sam"]]) },
    catalog,
    transaction,
  });
});

const freshMart = { printedName: "FRESH MART", phones: [{ number: "(555) 010-2000" }] };
const cornerShop = { printedName: "CORNER SHOP", phones: [{ number: "(555) 010-9000" }] };
const milkLine = { printedName: "WHOLE MILK GAL", itemCode: "4417", amount: 3.49 };
const breadLine = { printedName: "SOURDOUGH", amount: 4.99 };

async function extracted(reply: object, guesses: LineGuess[] = []): Promise<string> {
  const id = newId();
  await service.putReceipt(
    { id, capturedAt: "2026-11-15T10:00:00Z", images: [fakeImage("jpeg", { width: 1000, height: 2000 })] },
    SAM,
  );
  clock.advance(1000);
  service.saveExtraction(id, ExtractedReceipt.parse(reply), guesses);
  clock.advance(1000);
  return id;
}

const receipt = (id: string): ReceiptDetail => {
  const detail = service.getReceipt(id);
  if (detail === undefined) throw new Error(`no receipt ${id}`);
  return detail;
};

type Lines = ReceiptDetail["draft"]["lines"];

function confirmed(id: string, store: StoreChoice, change: (lines: Lines) => Lines = (lines) => lines) {
  const detail = receipt(id);
  const result = service.confirm(
    {
      id,
      expectedUpdatedAt: detail.updatedAt,
      store,
      draft: {
        ...detail.draft,
        totalCents: detail.draft.totalCents ?? 100,
        lines: change(detail.draft.lines),
      },
      answers: [],
    },
    SAM,
  );
  clock.advance(1000);
  if (!result.ok) throw new Error(`confirm failed: ${result.error.kind}`);
  return result.value.receipt;
}

function category(name: string): string {
  const found = catalog.listCategories().find((c) => c.name === name);
  if (found === undefined) throw new Error(`no category ${name}`);
  return found.id;
}

function added(name: string, parentId: string | null): string {
  const result = catalog.addCategory(name, parentId);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.id;
}

function tag(name: string): string {
  const result = catalog.addTag(name);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.id;
}

/** A store and a named milk item, from one confirmed receipt. */
function storeAndMilk(detail: ReceiptDetail) {
  const storeId = detail.store?.id;
  const itemId = detail.draft.lines[0]?.itemRef?.id;
  if (storeId === undefined || itemId === undefined) throw new Error("no store or item");
  return { storeId, itemId };
}

const nameMilk = (lines: Lines): Lines =>
  lines.map((line, index) =>
    index === 0 ? { ...line, item: { kind: "new", name: "Whole milk", categoryId: null, tagIds: [] } } : line,
  );

describe("where a line's category comes from", () => {
  it("with a store default of Groceries, every line from that store is Groceries and the model's differing guess is not shown", async () => {
    const dining = category("Dining");
    const first = await extracted({ store: freshMart, total: 8.48, lines: [milkLine, breadLine] });
    const { storeId } = storeAndMilk(confirmed(first, { kind: "new", name: "Fresh Mart" }, nameMilk));
    expect(catalog.setStoreDefaultCategory(storeId, category("Groceries")).ok).toBe(true);

    const second = await extracted({ store: freshMart, total: 8.48, lines: [milkLine, breadLine] }, [
      { suggestedCategoryId: dining, suggestedTagIds: [] },
      { suggestedCategoryId: dining, suggestedTagIds: [] },
    ]);
    const lines = receipt(second).draft.lines;
    expect(lines.map((line) => line.category)).toEqual([
      { categoryId: category("Groceries"), source: "store" },
      { categoryId: category("Groceries"), source: "store" },
    ]);
    // The guess is kept for measuring accuracy; the page shows it only for an Unclassified line.
    expect(lines[0]?.suggestedCategoryId).toBe(dining);
  });

  it("a category set for this item applies to its next purchase from any store", async () => {
    const first = await extracted({ store: freshMart, total: 3.49, lines: [milkLine] });
    const { itemId } = storeAndMilk(confirmed(first, { kind: "new", name: "Fresh Mart" }, nameMilk));
    const dairy = added("Dairy", category("Groceries"));
    expect(catalog.setItemCategory(itemId, dairy).ok).toBe(true);

    const elsewhere = await extracted({ store: cornerShop, total: 3.49, lines: [milkLine] });
    const done = confirmed(elsewhere, { kind: "new", name: "Corner Shop" }, (lines) =>
      lines.map((line) => ({ ...line, item: { kind: "existing", itemId } })),
    );
    expect(done.draft.lines[0]?.category).toEqual({ categoryId: dairy, source: "item" });
  });

  it("a category for this purchase only changes nothing else, and wins over the item's", async () => {
    const first = await extracted({ store: freshMart, total: 3.49, lines: [milkLine] });
    const gifts = category("Gifts");
    const done = confirmed(first, { kind: "new", name: "Fresh Mart" }, (lines) =>
      nameMilk(lines).map((line) => ({ ...line, categoryId: gifts })),
    );
    const { storeId, itemId } = storeAndMilk(done);
    catalog.setItemCategory(itemId, category("Groceries"));
    expect(receipt(first).draft.lines[0]?.category).toEqual({ categoryId: gifts, source: "line" });
    expect(catalog.itemDetail(itemId)?.categoryId).toBe(category("Groceries"));
    expect(catalog.storeDefaultCategory(storeId)).toBeNull();
  });

  it("a new item named on the receipt gets the category and tags chosen for it", async () => {
    const breakfast = tag("breakfast");
    const id = await extracted({ store: freshMart, total: 3.49, lines: [milkLine] });
    const done = confirmed(id, { kind: "new", name: "Fresh Mart" }, (lines) =>
      lines.map((line) => ({
        ...line,
        item: { kind: "new", name: "Whole milk", categoryId: category("Groceries"), tagIds: [breakfast] },
      })),
    );
    const { itemId } = storeAndMilk(done);
    expect(catalog.itemDetail(itemId)).toMatchObject({
      categoryId: category("Groceries"),
      tagIds: [breakfast],
    });
    expect(done.draft.lines[0]?.category).toEqual({ categoryId: category("Groceries"), source: "item" });
  });

  it("Set all lines gives every line a this-purchase category", async () => {
    const id = await extracted({ store: freshMart, total: 8.48, lines: [milkLine, breadLine] });
    const household = category("Household");
    const done = confirmed(id, { kind: "new", name: "Fresh Mart" }, (lines) =>
      lines.map((line) => ({ ...line, categoryId: household })),
    );
    expect(done.draft.lines.map((line) => line.category)).toEqual([
      { categoryId: household, source: "line" },
      { categoryId: household, source: "line" },
    ]);
  });

  it("drops a category or tag that no longer exists", async () => {
    const id = await extracted({ store: freshMart, total: 3.49, lines: [milkLine] });
    const done = confirmed(id, { kind: "new", name: "Fresh Mart" }, (lines) =>
      lines.map((line) => ({ ...line, categoryId: newId(), tagIds: [newId()] })),
    );
    expect(done.draft.lines[0]).toMatchObject({ categoryId: null, tagIds: [], category: null });
  });
});

describe("suggestions", () => {
  it("have no effect until accepted, and the outcome is recorded", async () => {
    const bakery = added("Bakery", category("Groceries"));
    const fresh = tag("fresh");
    const id = await extracted({ store: freshMart, total: 8.48, lines: [milkLine, breadLine] }, [
      { suggestedCategoryId: category("Groceries"), suggestedTagIds: [] },
      { suggestedCategoryId: bakery, suggestedTagIds: [fresh] },
    ]);
    const before = receipt(id).draft.lines;
    expect(before.map((line) => line.category)).toEqual([null, null]);
    expect(before[1]).toMatchObject({ suggestedCategoryId: bakery, suggestedTagIds: [fresh], tagIds: [] });

    // Dismissing the milk's guess; accepting the bread's "for this purchase only".
    const done = confirmed(id, { kind: "new", name: "Fresh Mart" }, (lines) =>
      lines.map((line, index) =>
        index === 0
          ? { ...line, suggestionOutcome: "dismissed" }
          : { ...line, categoryId: bakery, tagIds: [fresh], suggestionOutcome: "accepted" },
      ),
    );
    expect(done.draft.lines.map((line) => [line.suggestionOutcome, line.category])).toEqual([
      ["dismissed", null],
      ["accepted", { categoryId: bakery, source: "line" }],
    ]);
    expect(done.draft.lines[1]?.tagIds).toEqual([fresh]);
  });
});

describe("tags", () => {
  it("a tag on an item shows on all its purchases; a tag on one purchase only there", async () => {
    const breakfast = tag("breakfast");
    const gift = tag("gift");
    const first = await extracted({ store: freshMart, total: 3.49, lines: [milkLine] });
    const done = confirmed(first, { kind: "new", name: "Fresh Mart" }, (lines) =>
      nameMilk(lines).map((line) => ({ ...line, tagIds: [gift] })),
    );
    const { storeId, itemId } = storeAndMilk(done);
    catalog.setItemTags(itemId, [breakfast]);

    const second = await extracted({ store: freshMart, total: 3.49, lines: [milkLine] });
    const again = confirmed(second, { kind: "existing", storeId });
    expect(again.draft.lines[0]).toMatchObject({ itemRef: { id: itemId }, tagIds: [] });
    expect(catalog.itemLabels([itemId]).get(itemId)?.tagIds).toEqual([breakfast]);
    expect(receipt(first).draft.lines[0]?.tagIds).toEqual([gift]);

    // Both purchases have breakfast through the item; only the first has gift.
    const counts = new Map(catalog.listTags().map((t) => [t.name, t.purchaseCount]));
    expect(counts).toEqual(
      new Map([
        ["breakfast", 2],
        ["gift", 1],
      ]),
    );
  });
});

describe("removing categories and tags", () => {
  it("deletes one nothing uses, and archives one a purchase uses", async () => {
    expect(catalog.removeCategory(category("Pets"))).toEqual({ ok: true, value: "deleted" });
    expect(catalog.listCategories().some((c) => c.name === "Pets")).toBe(false);

    const id = await extracted({ store: freshMart, total: 3.49, lines: [milkLine] });
    const gifts = category("Gifts");
    const gift = tag("gift");
    confirmed(id, { kind: "new", name: "Fresh Mart" }, (lines) =>
      lines.map((line) => ({ ...line, categoryId: gifts, tagIds: [gift] })),
    );
    expect(catalog.removeCategory(gifts)).toEqual({ ok: true, value: "archived" });
    expect(catalog.removeTag(gift)).toEqual({ ok: true, value: "archived" });
    // Past purchases keep it; the model is no longer offered it.
    expect(receipt(id).draft.lines[0]?.category).toEqual({ categoryId: gifts, source: "line" });
    expect(catalog.labelChoices().categories.some((c) => c.id === gifts)).toBe(false);
    expect(catalog.labelChoices().tags).toEqual([]);
  });

  it("archives an entry with children, and hides them too", () => {
    const groceries = category("Groceries");
    const dairy = added("Dairy", groceries);
    expect(catalog.removeCategory(groceries)).toEqual({ ok: true, value: "archived" });
    const offered = catalog.labelChoices().categories.map((c) => c.id);
    expect(offered).not.toContain(groceries);
    expect(offered).not.toContain(dairy);
    expect(catalog.restoreCategory(dairy).ok).toBe(true);
    expect(catalog.labelChoices().categories.map((c) => c.path)).toContain("Groceries › Dairy");
  });

  it("archives a category that is an item's or a store's default", async () => {
    const id = await extracted({ store: freshMart, total: 3.49, lines: [milkLine] });
    const { storeId, itemId } = storeAndMilk(confirmed(id, { kind: "new", name: "Fresh Mart" }, nameMilk));
    catalog.setItemCategory(itemId, category("Dining"));
    catalog.setStoreDefaultCategory(storeId, category("Health"));
    expect(catalog.removeCategory(category("Dining"))).toEqual({ ok: true, value: "archived" });
    expect(catalog.removeCategory(category("Health"))).toEqual({ ok: true, value: "archived" });
  });
});
