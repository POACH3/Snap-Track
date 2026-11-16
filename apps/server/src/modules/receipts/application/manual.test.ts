// Use-case tests for manual entry, duplicate warnings and deleting receipts (SPEC.md §6.5, §6.6;
// docs/feature-plans/manual-entry-plan.md): the whole server wired on in-memory SQLite, with a
// scripted extractor, in-memory images and a fake clock.
import { ExtractedReceipt, type ReceiptDetail, type ReceiptDraft } from "@snaptrack/contracts";
import { newId } from "@snaptrack/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../../../testing/create-test-app.ts";
import { fakeImage } from "../../../testing/test-images.ts";
import type { InMemoryFileStore } from "../testing/in-memory-file-store.ts";

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

const service = () => t.receipts.service;

const emptyDraft = (change: Partial<ReceiptDraft> = {}): ReceiptDraft => ({
  purchasedAt: "2026-11-15",
  subtotalCents: null,
  discountCents: null,
  taxCents: null,
  tipCents: null,
  totalCents: 1250,
  printedSavingsCents: null,
  printedItemCount: null,
  taxLines: [],
  payments: [],
  transactionNumbers: [],
  storeEvidence: {
    logoText: null,
    brandGuess: null,
    printedName: null,
    legalName: null,
    branchName: null,
    storeNumber: null,
    address: null,
    phones: [],
    websites: [],
    emails: [],
    merchantId: null,
  },
  note: null,
  lines: [],
  ...change,
});

/** A quick entry: one line for the whole amount, in `categoryId` for this purchase when given. */
const quickDraft = (
  totalCents: number,
  categoryId: string | null = null,
  change: Partial<ReceiptDraft> = {},
) =>
  emptyDraft({
    totalCents,
    lines: [
      {
        item: null,
        kind: "item",
        rawName: null,
        itemCode: null,
        quantityMilli: 1000,
        unit: "each",
        unitPriceCents: null,
        lineTotalCents: totalCents,
        discountCents: null,
        taxCode: null,
        categoryId,
        tagIds: [],
        suggestionOutcome: null,
      },
    ],
    ...change,
  });

function saveManual(
  draft: ReceiptDraft,
  store: { kind: "new"; name: string } | { kind: "existing"; storeId: string },
  id = newId(),
): ReceiptDetail {
  const result = service().putManual(
    { id, capturedAt: "2026-11-16T11:00:00.000Z", store, draft, answers: [] },
    sam,
  );
  t.clock.advance(1000);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.receipt;
}

function category(name: string): string {
  const found = t.catalog.service.listCategories().find((c) => c.name === name);
  if (found === undefined) throw new Error(`no ${name}`);
  return found.id;
}

async function extracted(reply: object, photo = fakeImage("jpeg", { width: 1000, height: 1800 }, newId())) {
  const id = newId();
  const put = await service().putReceipt({ id, capturedAt: "2026-11-16T10:00:00Z", images: [photo] }, sam);
  if (!put.ok) throw new Error("upload failed");
  service().saveExtraction(id, ExtractedReceipt.parse(reply), []);
  t.clock.advance(1000);
  return id;
}

/** Each duplicate as [kind, reason, the other receipt's id]. */
const dupes = (list: ReceiptDetail["duplicates"]) => list.map((d) => [d.kind, d.reason, d.receipt.id]);

const detail = (id: string): ReceiptDetail => {
  const found = service().getReceipt(id);
  if (found === undefined) throw new Error(`no receipt ${id}`);
  return found;
};

function confirm(id: string, store: { kind: "new"; name: string } | { kind: "existing"; storeId: string }) {
  const current = detail(id);
  const result = service().confirm(
    { id, expectedUpdatedAt: current.updatedAt, store, draft: current.draft, answers: [] },
    sam,
  );
  t.clock.advance(1000);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.receipt;
}

describe("manual entry", () => {
  it("a quick entry is saved confirmed, as manual, logged by the person, and listed", () => {
    const saved = saveManual(quickDraft(1250), { kind: "new", name: "Corner Café" });
    expect(saved).toMatchObject({
      status: "confirmed",
      source: "manual",
      totalCents: 1250,
      store: { name: "Corner Café" },
      loggedBy: { id: sam },
      confirmedBy: { id: sam },
      images: [],
    });
    const listed = service().listReceipts({ cursor: undefined, limit: 10 });
    expect(listed.ok && listed.value.receipts.map((r) => [r.id, r.source])).toEqual([[saved.id, "manual"]]);
  });

  it("a retried save is one entry", () => {
    const id = newId();
    saveManual(quickDraft(1250), { kind: "new", name: "Corner Café" }, id);
    const again = saveManual(quickDraft(9999), { kind: "new", name: "Corner Café" }, id);
    expect(again.totalCents).toBe(1250);
    const listed = service().listReceipts({ cursor: undefined, limit: 10 });
    expect(listed.ok && listed.value.receipts).toHaveLength(1);
  });

  it("a quick entry with no category follows the store's default; with one, it is this purchase's", () => {
    const first = saveManual(quickDraft(1250), { kind: "new", name: "Corner Café" });
    const storeId = first.store?.id ?? "";
    expect(first.draft.lines[0]?.category).toBeNull();
    t.catalog.service.setStoreDefaultCategory(storeId, category("Dining"));
    expect(detail(first.id).draft.lines[0]?.category).toEqual({
      categoryId: category("Dining"),
      source: "store",
    });

    const gift = saveManual(quickDraft(800, category("Gifts")), { kind: "existing", storeId });
    expect(gift.draft.lines[0]?.category).toEqual({ categoryId: category("Gifts"), source: "line" });
  });

  it("a full entry keeps its lines and names a new item, which the next purchase shows", () => {
    const line = quickDraft(3498).lines[0];
    if (line === undefined) throw new Error("no line");
    const saved = saveManual(
      emptyDraft({
        totalCents: 3827,
        taxCents: 329,
        lines: [
          {
            ...line,
            rawName: "PAINT 1GAL",
            item: { kind: "new", name: "Paint, 1 gal", categoryId: null, tagIds: [] },
          },
        ],
      }),
      { kind: "new", name: "Hardware Depot" },
    );
    expect(saved.draft.lines.map((l) => [l.rawName, l.itemRef?.name, l.lineTotalCents])).toEqual([
      ["PAINT 1GAL", "Paint, 1 gal", 3498],
    ]);
  });
});

describe("duplicates", () => {
  const store = { printedName: "FRESH MART", phones: [{ number: "(555) 010-2000" }] };
  const reply = (change: object = {}) => ({
    store,
    purchaseDate: "2026-11-13",
    purchaseTime: "17:42",
    total: 7.0,
    lines: [{ printedName: "MILK", amount: 7.0 }],
    ...change,
  });

  it("a matching transaction number at the same store is a definite duplicate, shown on both", async () => {
    const first = await extracted(reply({ transactionNumbers: [{ label: "TRN", value: "004471" }] }));
    const storeId = confirm(first, { kind: "new", name: "Fresh Mart" }).store?.id ?? "";
    const second = await extracted(
      reply({ total: 9.0, transactionNumbers: [{ label: "TRN", value: "0044-71" }] }),
    );
    expect(detail(second).store?.id).toBe(storeId);
    expect(dupes(detail(second).duplicates)).toEqual([["definite", "transaction_number", first]]);
    expect(detail(first).duplicates.map((d) => d.receipt.id)).toEqual([second]);
  });

  it("Not a duplicate hides the pair for both receipts", async () => {
    const first = await extracted(reply());
    confirm(first, { kind: "new", name: "Fresh Mart" });
    const second = await extracted(reply());
    expect(dupes(detail(second).duplicates)).toEqual([["possible", "same_details", first]]);
    const result = service().dismissDuplicate(second, first, sam);
    expect(result.ok && result.value.duplicates).toEqual([]);
    expect(detail(first).duplicates).toEqual([]);
  });

  it("the same photo uploaded twice is a definite duplicate, even before a store is known", async () => {
    const photo = fakeImage("jpeg", { width: 1000, height: 1800 }, "same");
    const first = await extracted({ total: 5 }, photo);
    const second = await extracted({ total: 5 }, photo);
    expect(dupes(detail(second).duplicates)).toEqual([["definite", "same_photo", first]]);
  });

  it("a manual entry being typed is checked against the store's receipts as you go", async () => {
    const first = await extracted(reply());
    const storeId = confirm(first, { kind: "new", name: "Fresh Mart" }).store?.id ?? "";
    const typed = quickDraft(700, null, { purchasedAt: "2026-11-13" });
    const check = service().checkDraft(newId(), typed, storeId);
    expect(dupes(check.duplicates)).toEqual([["possible", "same_details", first]]);
    expect(service().checkDraft(newId(), typed, null).duplicates).toEqual([]);
  });
});

describe("deleting a receipt", () => {
  it("removes it with its lines, photos and extraction job, and keeps what was learned", async () => {
    const files = t.files as InMemoryFileStore;
    const store = { printedName: "FRESH MART", phones: [{ number: "(555) 010-2000" }] };
    const id = await extracted({ store, total: 7, lines: [{ printedName: "MILK", amount: 7 }] });
    const storeId = confirm(id, { kind: "new", name: "Fresh Mart" }).store?.id ?? "";
    expect(files.files.size).toBeGreaterThan(0);
    expect(t.extraction.jobs.findByReceipt(id)).toBeDefined();

    expect(await service().deleteReceipt(id)).toEqual({ ok: true, value: undefined });
    expect(service().getReceipt(id)).toBeUndefined();
    expect(files.files.size).toBe(0);
    expect(t.extraction.jobs.findByReceipt(id)).toBeUndefined();
    expect(await service().deleteReceipt(id)).toEqual({ ok: false, error: { kind: "receipt-not-found" } });

    // The store it taught is still recognized.
    const next = await extracted({ store, total: 3 });
    expect(detail(next).store?.id).toBe(storeId);
  });

  it("removes its dismissals too", async () => {
    const a = saveManual(quickDraft(700), { kind: "new", name: "Corner Café" });
    const b = saveManual(quickDraft(700), { kind: "existing", storeId: a.store?.id ?? "" });
    service().dismissDuplicate(a.id, b.id, sam);
    expect(await service().deleteReceipt(b.id)).toMatchObject({ ok: true });
    expect(detail(a.id).duplicates).toEqual([]);
  });
});
