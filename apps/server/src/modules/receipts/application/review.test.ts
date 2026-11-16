// Use-case tests for review, confirm and store matching (SPEC.md §6.4, §6.5, §6.7): real SQLite in
// memory with the real catalog module, fakes for files, images and clock.
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
const users = { displayNames: () => new Map([[SAM, "Sam"]]) };

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
    users,
    catalog,
    transaction,
  });
});

const walmartStore = {
  printedName: "WALMART SUPERCENTER",
  phones: [{ number: "(555) 123-4567", label: "Store" }],
  websites: ["walmart.com"],
  address: { street: "1 Main St", city: "Springfield", state: "IL", zip: "62701" },
};

/** An uploaded receipt that the model read as `reply`. */
async function extracted(reply: object): Promise<string> {
  const id = newId();
  const put = await service.putReceipt(
    { id, capturedAt: "2026-11-15T10:00:00Z", images: [fakeImage("jpeg", { width: 1000, height: 2000 })] },
    SAM,
  );
  if (!put.ok) throw new Error("upload failed");
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

function confirm(
  id: string,
  store: StoreChoice,
  options: { answers?: { key: string; move: boolean }[]; total?: number } = {},
) {
  const detail = receipt(id);
  const result = service.confirm(
    {
      id,
      expectedUpdatedAt: detail.updatedAt,
      store,
      draft: { ...detail.draft, totalCents: options.total ?? detail.draft.totalCents ?? 100 },
      answers: options.answers ?? [],
    },
    SAM,
  );
  clock.advance(1000);
  return result;
}

function confirmedAs(id: string, store: StoreChoice) {
  const result = confirm(id, store);
  if (!result.ok) throw new Error(`confirm failed: ${result.error.kind}`);
  return result.value;
}

describe("matching stores", () => {
  it("after a company is confirmed once, a receipt from another location sharing one identifier matches it", async () => {
    const first = await extracted({ store: walmartStore, total: 10 });
    expect(receipt(first)).toMatchObject({ store: null, storeIssue: "unknown" });
    const { receipt: confirmed } = confirmedAs(first, { kind: "new", name: "Walmart" });
    expect(confirmed).toMatchObject({
      status: "confirmed",
      store: { name: "Walmart" },
      storeMatchedBy: "user",
    });

    const second = await extracted({
      store: { printedName: "Walmart #4410", websites: ["www.walmart.com"] },
      total: 5,
    });
    expect(receipt(second)).toMatchObject({
      status: "unreviewed",
      store: { name: "Walmart" },
      storeMatchedBy: "identifier",
      storeMatch: { matched: [{ type: "website", displayValue: "walmart.com" }] },
      storeIssue: null,
      storeSuggestions: [],
    });
  });

  it("flags a receipt whose identifiers point to two companies, and applies neither", async () => {
    confirmedAs(await extracted({ store: { phones: [{ number: "555-123-4567" }] }, total: 1 }), {
      kind: "new",
      name: "Walmart",
    });
    confirmedAs(await extracted({ store: { websites: ["target.com"] }, total: 1 }), {
      kind: "new",
      name: "Target",
    });

    const mixed = await extracted({
      store: { phones: [{ number: "555-123-4567" }], websites: ["target.com"] },
      total: 1,
    });
    const detail = receipt(mixed);
    expect(detail).toMatchObject({ store: null, storeIssue: "conflict" });
    expect(detail.storeSuggestions.map((s) => [s.store.name, s.reason]).sort()).toEqual([
      ["Target", "identifier"],
      ["Walmart", "identifier"],
    ]);
  });

  it("flags a receipt that matches a known company only by its address", async () => {
    confirmedAs(await extracted({ store: { address: walmartStore.address }, total: 1 }), {
      kind: "new",
      name: "Corner Cafe",
    });
    const sameAddress = await extracted({
      store: { printedName: "Joe's Coffee", address: walmartStore.address },
      total: 1,
    });
    expect(receipt(sameAddress)).toMatchObject({
      store: null,
      storeIssue: "address_only",
      storeSuggestions: [{ store: { name: "Corner Cafe" }, reason: "address" }],
    });
  });

  it("correcting a wrong automatic match stops the identifier that caused it from matching again", async () => {
    const shared = { phones: [{ number: "555-123-4567" }] };
    confirmedAs(await extracted({ store: shared, total: 1 }), { kind: "new", name: "Mall Kiosk" });

    const wronglyMatched = await extracted({
      store: { ...shared, websites: ["pretzels.example"] },
      total: 1,
    });
    expect(receipt(wronglyMatched).store?.name).toBe("Mall Kiosk");
    confirmedAs(wronglyMatched, { kind: "new", name: "Pretzel Place" });

    const third = await extracted({ store: shared, total: 1 });
    expect(receipt(third)).toMatchObject({ store: null, storeIssue: "unknown" });
    // Its other identifiers were learned for the right store.
    expect(
      receipt(await extracted({ store: { websites: ["pretzels.example"] }, total: 1 })).store?.name,
    ).toBe("Pretzel Place");
  });
});

describe("confirm", () => {
  it("asks before moving an identifier saved for another store, saving nothing until answered", async () => {
    const phone = { phones: [{ number: "555-123-4567" }] };
    // Read before any store knew its phone number, so it has no store.
    const id = await extracted({ store: { ...phone, websites: ["walmart.com"] }, total: 1 });
    confirmedAs(await extracted({ store: phone, total: 1 }), { kind: "new", name: "Target" });

    const asked = confirm(id, { kind: "new", name: "Walmart" });
    if (asked.ok || asked.error.kind !== "needs-answers") throw new Error("expected a question");
    expect(asked.error.questions).toHaveLength(1);
    expect(asked.error.questions[0]).toMatchObject({
      identifier: { type: "phone", displayValue: "555-123-4567" },
      savedFor: { name: "Target" },
    });
    // Nothing was saved: not the receipt, and not the new store.
    expect(receipt(id).status).toBe("unreviewed");
    expect(catalog.searchStores("Walmart")).toEqual([]);

    const key = asked.error.questions[0]?.key ?? "";
    expect(confirm(id, { kind: "new", name: "Walmart" }, { answers: [{ key, move: true }] }).ok).toBe(true);
    expect(receipt(await extracted({ store: phone, total: 1 })).store?.name).toBe("Walmart");
  });

  it("can't confirm without a store; can with every other field empty", async () => {
    const id = await extracted({ store: walmartStore });
    const result = confirmedAs(id, { kind: "new", name: "Walmart" });
    expect(result.receipt).toMatchObject({ status: "confirmed", confirmedBy: { displayName: "Sam" } });
    expect(confirm(id, { kind: "existing", storeId: newId() })).toEqual({
      ok: false,
      error: { kind: "store-not-found" },
    });
  });

  it("refuses a confirm made from an out-of-date form, and a new store whose name is taken", async () => {
    const id = await extracted({ store: walmartStore, total: 1 });
    const detail = receipt(id);
    const stale = {
      id,
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      store: { kind: "new" as const, name: "W" },
      draft: detail.draft,
      answers: [],
    };
    expect(service.confirm(stale, SAM)).toEqual({ ok: false, error: { kind: "receipt-changed" } });

    catalog.createStore("Walmart");
    expect(confirm(id, { kind: "new", name: "walmart" })).toEqual({
      ok: false,
      error: { kind: "name-taken" },
    });
    expect(receipt(id).status).toBe("unreviewed");
  });

  it("keeps what a person typed into a receipt still waiting for the model", async () => {
    const id = newId();
    await service.putReceipt(
      { id, capturedAt: "2026-11-15T10:00:00Z", images: [fakeImage("jpeg", { width: 900, height: 900 })] },
      SAM,
    );
    confirmedAs(id, { kind: "new", name: "Farmers Market" });
    service.saveExtraction(id, ExtractedReceipt.parse({ total: 99, store: walmartStore }));
    expect(receipt(id)).toMatchObject({
      status: "confirmed",
      totalCents: 100,
      store: { name: "Farmers Market" },
    });
  });

  it("lets a review-required receipt be entered by hand and confirmed", async () => {
    const id = await extracted({ store: null });
    expect(receipt(id).status).toBe("review_required");
    const detail = receipt(id);
    const result = service.confirm(
      {
        id,
        expectedUpdatedAt: detail.updatedAt,
        store: { kind: "new", name: "Corner Store" },
        draft: {
          ...detail.draft,
          totalCents: 450,
          lines: [
            {
              item: null,
              kind: "item",
              rawName: "Milk",
              itemCode: null,
              quantityMilli: 1000,
              unit: "each",
              unitPriceCents: null,
              lineTotalCents: 450,
              discountCents: null,
              taxCode: null,
            },
          ],
        },
        answers: [],
      },
      SAM,
    );
    expect(result.ok && result.value.receipt).toMatchObject({
      status: "confirmed",
      totalCents: 450,
      draft: { lines: [{ rawName: "Milk" }] },
    });
  });

  it("updates kept lines in place, adds new ones and removes the rest, in the form's order", async () => {
    const id = await extracted({
      total: 6,
      lines: [
        { printedName: "A", amount: 1 },
        { printedName: "B", amount: 2 },
        { printedName: "C", amount: 3 },
      ],
    });
    const detail = receipt(id);
    const [a, , c] = detail.draft.lines;
    if (a === undefined || c === undefined) throw new Error("lines missing");
    const newLine = { ...a, id: undefined, rawName: "D", lineTotalCents: 4 };
    const result = service.confirm(
      {
        id,
        expectedUpdatedAt: detail.updatedAt,
        store: { kind: "new", name: "Shop" },
        draft: { ...detail.draft, lines: [{ ...c, rawName: "C2" }, newLine, a] },
        answers: [],
      },
      SAM,
    );
    const lines = result.ok ? result.value.receipt.draft.lines : [];
    expect(lines.map((line) => line.rawName)).toEqual(["C2", "D", "A"]);
    expect(lines[0]?.id).toBe(c.id);
    expect(lines[2]?.id).toBe(a.id);
  });

  it("offers to re-match other receipts after learning, and changes them only when asked", async () => {
    const first = await extracted({ store: walmartStore, total: 1 });
    const waiting = await extracted({ store: { websites: ["walmart.com"] }, total: 2 });
    const unrelated = await extracted({ store: { websites: ["target.com"] }, total: 3 });

    const { rematchCount } = confirmedAs(first, { kind: "new", name: "Walmart" });
    expect(rematchCount).toBe(1);
    expect(receipt(waiting).store).toBeNull();

    expect(service.rematch()).toEqual({ matched: 1, items: 0 });
    expect(receipt(waiting)).toMatchObject({ store: { name: "Walmart" }, storeMatchedBy: "identifier" });
    expect(receipt(unrelated).store).toBeNull();
    expect(service.rematch()).toEqual({ matched: 0, items: 0 });
  });
});

describe("the receipt as shown", () => {
  it("counts a receipt with no total read as its lines − discount + tax + tip", async () => {
    const id = await extracted({
      lines: [
        { printedName: "A", amount: 4 },
        { printedName: "B", amount: 6 },
      ],
      receiptDiscount: 1,
      tax: 0.5,
    });
    expect(receipt(id).totalCents).toBe(950);
    const listed = service.listReceipts({ cursor: undefined, limit: 10 });
    expect(listed.ok && listed.value.receipts[0]?.totalCents).toBe(950);
  });

  it("filters the list to receipts waiting for a person", async () => {
    const unreviewed = await extracted({ total: 1 });
    const unreadable = await extracted({});
    const byStatus = (status: "unreviewed" | "review_required") => {
      const result = service.listReceipts({ cursor: undefined, limit: 10, status });
      return result.ok ? result.value.receipts.map((r) => r.id) : [];
    };
    expect(byStatus("unreviewed")).toEqual([unreviewed]);
    expect(byStatus("review_required")).toEqual([unreadable]);
    expect(service.countWaiting()).toEqual({ unreviewed: 1, reviewRequired: 1 });
  });

  it("works out warnings for the form's current figures without saving them", async () => {
    const id = await extracted({
      subtotal: 10,
      tax: 1,
      total: 11,
      lines: [{ printedName: "A", amount: 10 }],
    });
    const detail = receipt(id);
    expect(detail.warnings).toEqual([]);
    const result = service.checkDraft(id, { ...detail.draft, totalCents: 2000 });
    expect(result).toEqual({
      ok: true,
      value: [{ kind: "subtotal-vs-total", expectedCents: 1100, printedCents: 2000 }],
    });
    expect(receipt(id).draft.totalCents).toBe(1100);
  });
});
