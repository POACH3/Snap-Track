// Use-case tests for items (SPEC.md §6.4 step 2, §6.7; docs/feature-plans/items-plan.md): real
// SQLite in memory with the real catalog module, fakes for files, images and clock.
import { ExtractedReceipt, type ReceiptDetail, type StoreChoice } from "@snaptrack/contracts";
import { newId } from "@snaptrack/core";
import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { SqliteTransaction } from "../../../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { createCatalogModule, type CatalogService } from "../../catalog/index.ts";
import { SqliteReceiptRepository } from "../adapters/sqlite-receipt-repository.ts";
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
  catalog = createCatalogModule({ db, clock, transaction }).service;
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
const otherShop = { printedName: "CORNER SHOP", phones: [{ number: "(555) 010-9000" }] };

async function extracted(reply: object): Promise<string> {
  const id = newId();
  await service.putReceipt(
    { id, capturedAt: "2026-11-15T10:00:00Z", images: [fakeImage("jpeg", { width: 1000, height: 2000 })] },
    SAM,
  );
  clock.advance(1000);
  service.saveExtraction(id, ExtractedReceipt.parse(reply));
  clock.advance(1000);
  return id;
}

const receipt = (id: string): ReceiptDetail => {
  const detail = service.getReceipt(id);
  if (detail === undefined) throw new Error(`no receipt ${id}`);
  return detail;
};

type Lines = ReceiptDetail["draft"]["lines"];

/** Confirms with the receipt's own draft, after `change` adjusts its lines. */
function confirm(
  id: string,
  store: StoreChoice,
  change: (lines: Lines) => Lines = (lines) => lines,
  answers: { key: string; move: boolean }[] = [],
) {
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
      answers,
    },
    SAM,
  );
  clock.advance(1000);
  return result;
}

function confirmed(id: string, store: StoreChoice, change?: (lines: Lines) => Lines) {
  const result = confirm(id, store, change);
  if (!result.ok) throw new Error(`confirm failed: ${result.error.kind}`);
  return result.value;
}

const nameAll = (lines: Lines): Lines =>
  lines.map((line) =>
    line.kind === "fee"
      ? line
      : { ...line, item: { kind: "new", name: line.suggestedItemName ?? line.rawName ?? "Item" } },
  );
const storeOf = (detail: ReceiptDetail): StoreChoice => {
  if (detail.store === null) throw new Error("no store");
  return { kind: "existing", storeId: detail.store.id };
};

describe("naming items and matching them again", () => {
  it("a named item is shown on the next receipt from the company with the same code but different printed text", async () => {
    const first = await extracted({
      store: freshMart,
      total: 3.49,
      lines: [
        { printedName: "GV WHL MLK GAL", itemCode: "4417", amount: 3.49, suggestedName: "Whole milk, 1 gal" },
      ],
    });
    // A line with no item offers the model's readable name, which isn't applied on its own.
    expect(receipt(first).draft.lines[0]).toMatchObject({
      itemRef: null,
      itemSuggestion: { kind: "new", name: "Whole milk, 1 gal" },
    });
    const done = confirmed(first, { kind: "new", name: "Fresh Mart" }, nameAll);
    const milk = done.receipt.draft.lines[0]?.itemRef;
    expect(milk).toMatchObject({ name: "Whole milk, 1 gal", nameSource: "model" });
    if (milk === null || milk === undefined) return;

    catalog.renameItem(milk.id, "Milk");
    const second = await extracted({
      store: freshMart,
      total: 3.59,
      lines: [{ printedName: "GV WHOLE MILK 1GAL", itemCode: "4417", amount: 3.59 }],
    });
    expect(receipt(second).draft.lines[0]).toMatchObject({
      item: { kind: "existing", itemId: milk.id },
      itemRef: { name: "Milk", nameSource: "user" },
    });
  });

  it("matches a barcode at a different company", async () => {
    const first = await extracted({
      store: freshMart,
      total: 2,
      lines: [{ printedName: "OAT MILK", itemCode: "036000291452", amount: 2 }],
    });
    confirmed(first, { kind: "new", name: "Fresh Mart" }, nameAll);
    const elsewhere = await extracted({
      store: otherShop,
      total: 2.5,
      lines: [{ printedName: "OATMLK 64OZ", itemCode: "0036000291452", amount: 2.5 }],
    });
    expect(receipt(elsewhere).draft.lines[0]?.itemRef?.name).toBe("OAT MILK");
  });

  it("keeps a fee line off the item whose code it shares (the logged core-charge bug)", async () => {
    const reply = {
      store: freshMart,
      total: 140,
      lines: [
        { printedName: "CAR BATTERY 24F", itemCode: "8812", amount: 118 },
        { printedName: "CORE CHARGE", itemCode: "8812", amount: 22, kind: "fee" },
      ],
    };
    const first = await extracted(reply);
    confirmed(first, { kind: "new", name: "Fresh Mart" }, nameAll);
    const lines = receipt(await extracted(reply)).draft.lines;
    expect(lines[0]?.itemRef?.name).toBe("CAR BATTERY 24F");
    expect(lines[1]?.itemRef).toBeNull();
  });

  it("never creates an item on its own: a line with none stays unmatched", async () => {
    const id = await extracted({ store: freshMart, total: 1, lines: [{ printedName: "GUM", amount: 1 }] });
    const done = confirmed(id, { kind: "new", name: "Fresh Mart" });
    expect(done.receipt.draft.lines[0]?.itemRef).toBeNull();
    expect(catalog.searchItems("")).toEqual([]);
  });

  it("offers an existing item with a similar name, without applying it", async () => {
    const first = await extracted({
      store: freshMart,
      total: 1,
      lines: [{ printedName: "BANANAS", amount: 1 }],
    });
    confirmed(first, { kind: "new", name: "Fresh Mart" }, nameAll);
    const second = await extracted({
      store: otherShop,
      total: 1,
      lines: [{ printedName: "BANANA", amount: 1 }],
    });
    expect(receipt(second).draft.lines[0]).toMatchObject({
      itemRef: null,
      itemSuggestion: { kind: "existing", item: { name: "BANANAS" }, reason: "similar" },
    });
  });
});

describe("choosing a different item", () => {
  it("asks before moving a line's identifiers to another item, together with store questions", async () => {
    const first = await extracted({
      store: freshMart,
      total: 5,
      lines: [
        { printedName: "MILK", itemCode: "4417", amount: 3 },
        { printedName: "BREAD", itemCode: "5520", amount: 2 },
      ],
    });
    const done = confirmed(first, { kind: "new", name: "Fresh Mart" }, nameAll);
    const bread = done.receipt.draft.lines[1]?.itemRef;
    if (bread === null || bread === undefined) throw new Error("no bread");

    const second = await extracted({
      store: freshMart,
      total: 3,
      lines: [{ printedName: "MILK", itemCode: "4417", amount: 3 }],
    });
    const wrong = (lines: Lines): Lines =>
      lines.map((line) => ({ ...line, item: { kind: "existing", itemId: bread.id } }));
    const asked = confirm(second, storeOf(receipt(second)), wrong);
    if (asked.ok || asked.error.kind !== "needs-answers") throw new Error("expected questions");
    expect(asked.error.questions).toHaveLength(2);
    expect(asked.error.questions[0]).toMatchObject({
      about: "item",
      savedFor: { name: "MILK" },
      movingTo: "BREAD",
    });

    const answers = asked.error.questions.map((q) => ({ key: q.key, move: true }));
    expect(confirm(second, storeOf(receipt(second)), wrong, answers).ok).toBe(true);
    const third = await extracted({
      store: freshMart,
      total: 3,
      lines: [{ printedName: "MILK", itemCode: "4417", amount: 3 }],
    });
    expect(receipt(third).draft.lines[0]?.itemRef?.name).toBe("BREAD");
  });
});

describe("re-matching earlier purchases", () => {
  it("offers the earlier lines a named item now matches, and changes them only when asked", async () => {
    const earlier = await extracted({
      store: freshMart,
      total: 3,
      lines: [{ printedName: "MILK", itemCode: "4417", amount: 3 }],
    });
    confirmed(earlier, { kind: "new", name: "Fresh Mart" });
    expect(receipt(earlier).draft.lines[0]?.itemRef).toBeNull();

    const later = await extracted({
      store: freshMart,
      total: 3,
      lines: [{ printedName: "MILK 1 GAL", itemCode: "4417", amount: 3 }],
    });
    const done = confirmed(later, storeOf(receipt(later)), nameAll);
    expect(done.itemRematchCount).toBe(1);
    expect(receipt(earlier).draft.lines[0]?.itemRef).toBeNull();

    expect(service.rematch()).toEqual({ matched: 0, items: 1 });
    expect(receipt(earlier).draft.lines[0]?.itemRef?.name).toBe("MILK 1 GAL");
    expect(service.rematch()).toEqual({ matched: 0, items: 0 });
  });
});

describe("an item's purchases", () => {
  it("lists them newest first with the store", async () => {
    const first = await extracted({
      store: freshMart,
      purchaseDate: "2026-11-01",
      total: 3,
      lines: [{ printedName: "MILK", itemCode: "4417", amount: 3 }],
    });
    const done = confirmed(first, { kind: "new", name: "Fresh Mart" }, nameAll);
    const milk = done.receipt.draft.lines[0]?.itemRef;
    if (milk === null || milk === undefined) throw new Error("no item");
    await extracted({
      store: freshMart,
      purchaseDate: "2026-11-08",
      total: 3.2,
      lines: [{ printedName: "MILK", itemCode: "4417", amount: 3.2 }],
    });

    const purchases = service.itemPurchases(milk.id, 10);
    expect(purchases.map((p) => [p.purchasedAt, p.lineTotalCents, p.store?.name])).toEqual([
      ["2026-11-08", 320, "Fresh Mart"],
      ["2026-11-01", 300, "Fresh Mart"],
    ]);
  });
});
