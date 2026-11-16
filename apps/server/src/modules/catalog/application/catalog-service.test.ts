import type { StoreEvidence } from "@snaptrack/contracts";
import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { SqliteTransaction } from "../../../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { createCatalogModule } from "../adapters/catalog-module.ts";
import type { CatalogService } from "./catalog-service.ts";

const RECEIPT_1 = "00000000-0000-4000-8000-0000000000a1";
const RECEIPT_2 = "00000000-0000-4000-8000-0000000000a2";

const evidence = (overrides: Partial<StoreEvidence> = {}): StoreEvidence => ({
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
  ...overrides,
});

const walmartReceipt = evidence({
  printedName: "WALMART SUPERCENTER",
  phones: [{ number: "(555) 123-4567", label: null }],
  websites: ["walmart.com"],
  address: { street: "1 Main St", city: "Springfield", state: "IL", zip: "62701" },
});
const fresh = { storeId: null, matchedBy: null, alreadyCounted: false };

let catalog: CatalogService;

beforeEach(() => {
  const sqlite = createTestDatabase();
  catalog = createCatalogModule({
    db: toDrizzle(sqlite),
    clock: new FakeClock(new Date("2026-11-15T12:00:00.000Z")),
    transaction: new SqliteTransaction(sqlite),
  }).service;
});

function store(name: string) {
  const result = catalog.createStore(name);
  if (!result.ok) throw new Error(`${name} exists`);
  return result.value;
}

function learn(
  storeId: string,
  receiptId: string,
  receipt: StoreEvidence,
  answers: { key: string; move: boolean }[] = [],
) {
  return catalog.learnFromConfirmedReceipt({
    receiptId,
    storeId,
    evidence: receipt,
    previous: fresh,
    lines: [],
    answers,
  });
}

describe("identifying and learning stores", () => {
  it("knows a store by any identifier learned from one confirmed receipt", () => {
    const walmart = store("Walmart");
    expect(catalog.identifyStore(walmartReceipt)).toBeUndefined();
    expect(learn(walmart.id, RECEIPT_1, walmartReceipt)).toEqual({ ok: true, value: { notices: [] } });

    // A different location: only the website is shared.
    const elsewhere = evidence({ printedName: "Walmart #99", websites: ["https://www.walmart.com/r"] });
    expect(catalog.identifyStore(elsewhere)).toEqual({
      storeId: walmart.id,
      match: { matched: [{ type: "website", displayValue: "walmart.com" }], supporting: [] },
    });
  });

  it("asks before moving an identifier, then moves it when told to", () => {
    const target = store("Target");
    const walmart = store("Walmart");
    learn(target.id, RECEIPT_1, evidence({ phones: [{ number: "555-123-4567", label: null }] }));

    const asked = learn(walmart.id, RECEIPT_2, walmartReceipt);
    expect(asked.ok).toBe(false);
    if (asked.ok) return;
    const [question] = asked.error.questions;
    expect(question).toMatchObject({ identifier: { type: "phone" }, savedFor: target });
    // Nothing was learned while the question was open.
    expect(catalog.storeDetail(walmart.id)?.identifiers).toEqual([]);

    expect(learn(walmart.id, RECEIPT_2, walmartReceipt, [{ key: question?.key ?? "", move: true }]).ok).toBe(
      true,
    );
    expect(
      catalog.identifyStore(evidence({ phones: [{ number: "5551234567", label: null }] }))?.storeId,
    ).toBe(walmart.id);
  });

  it("marks an address shared by two companies, and tells the user", () => {
    const cafe = store("Corner Cafe");
    const walmart = store("Walmart");
    learn(cafe.id, RECEIPT_1, evidence({ address: walmartReceipt.address }));
    const result = learn(walmart.id, RECEIPT_2, walmartReceipt);
    expect(result).toEqual({
      ok: true,
      value: {
        notices: [
          {
            kind: "shared_address",
            identifier: { type: "address", displayValue: "1 Main St, Springfield IL 62701" },
            alsoSavedFor: cafe,
          },
        ],
      },
    });
    expect(catalog.storeDetail(cafe.id)?.identifiers[0]?.state).toBe("ambiguous");
  });

  it("explains why a store needs a person, with suggestions", () => {
    const walmart = store("Walmart");
    learn(walmart.id, RECEIPT_1, evidence({ address: walmartReceipt.address }));
    expect(catalog.reviewStore(evidence({ address: walmartReceipt.address, brandGuess: "Walmart" }))).toEqual(
      {
        issue: "address_only",
        suggestions: [{ store: walmart, reason: "address", identifiers: [expect.anything()] }],
      },
    );
    expect(catalog.reviewStore(evidence({ printedName: "WAL MART" }))).toEqual({
      issue: "unknown",
      suggestions: [{ store: walmart, reason: "similar_name", identifiers: [] }],
    });
  });
});

describe("Library › Stores", () => {
  it("renames a store, keeping names unique ignoring case", () => {
    const walmart = store("Walmart");
    store("Target");
    expect(catalog.renameStore(walmart.id, "Walmart Inc")).toEqual({
      ok: true,
      value: { id: walmart.id, name: "Walmart Inc" },
    });
    expect(catalog.renameStore(walmart.id, "TARGET")).toEqual({ ok: false, error: { kind: "name-taken" } });
    expect(catalog.createStore("walmart inc")).toEqual({ ok: false, error: { kind: "name-taken" } });
  });

  it("adds an identifier by hand, normalized, and it starts matching", () => {
    const walmart = store("Walmart");
    const added = catalog.addIdentifier({
      storeId: walmart.id,
      type: "phone",
      value: " (555) 123-4567 ",
      answers: [],
    });
    expect(added.ok && added.value.identifiers).toEqual([
      expect.objectContaining({
        type: "phone",
        displayValue: "(555) 123-4567",
        addedByHand: true,
        timesSeen: 0,
      }),
    ]);
    expect(catalog.identifyStore(walmartReceipt)?.storeId).toBe(walmart.id);
    expect(
      catalog.addIdentifier({ storeId: walmart.id, type: "phone", value: "555.123.4567", answers: [] }),
    ).toEqual({
      ok: false,
      error: { kind: "identifier-exists" },
    });
  });

  it("refuses an identifier that can't identify a store", () => {
    const walmart = store("Walmart");
    expect(
      catalog.addIdentifier({ storeId: walmart.id, type: "website", value: "squareup.com", answers: [] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalid-identifier" },
    });
    expect(catalog.addIdentifier({ storeId: walmart.id, type: "phone", value: "12", answers: [] }).ok).toBe(
      false,
    );
  });

  it("asks before taking an identifier from another store", () => {
    const target = store("Target");
    const walmart = store("Walmart");
    catalog.addIdentifier({ storeId: target.id, type: "website", value: "walmart.com", answers: [] });
    const asked = catalog.addIdentifier({
      storeId: walmart.id,
      type: "website",
      value: "walmart.com",
      answers: [],
    });
    expect(asked).toMatchObject({
      ok: false,
      error: { kind: "needs-answers", questions: [{ savedFor: target }] },
    });
  });

  it("says so when a typed address is already another store's, and makes it shared", () => {
    const cafe = store("Corner Cafe");
    const walmart = store("Walmart");
    catalog.addIdentifier({ storeId: cafe.id, type: "address", value: "1 Main St, 62701", answers: [] });
    expect(
      catalog.addIdentifier({
        storeId: walmart.id,
        type: "address",
        value: "1 Main Street, 62701",
        answers: [],
      }),
    ).toEqual({
      ok: false,
      error: { kind: "shared-address", alsoSavedFor: cafe },
    });
    expect(catalog.storeDetail(cafe.id)?.identifiers[0]?.state).toBe("ambiguous");
  });

  it("stops matching on an identifier removed or marked ambiguous, and starts again when marked active", () => {
    const walmart = store("Walmart");
    learn(
      walmart.id,
      RECEIPT_1,
      evidence({ phones: [{ number: "555-123-4567", label: null }], websites: ["walmart.com"] }),
    );
    const [phoneRow, websiteRow] = catalog.storeDetail(walmart.id)?.identifiers ?? [];
    if (phoneRow === undefined || websiteRow === undefined) throw new Error("not learned");
    const byPhone = evidence({ phones: [{ number: "5551234567", label: null }] });
    const byWebsite = evidence({ websites: ["walmart.com"] });

    catalog.setIdentifierState(phoneRow.id, "ambiguous");
    expect(catalog.identifyStore(byPhone)).toBeUndefined();
    catalog.setIdentifierState(phoneRow.id, "active");
    expect(catalog.identifyStore(byPhone)?.storeId).toBe(walmart.id);

    catalog.removeIdentifier(websiteRow.id);
    expect(catalog.identifyStore(byWebsite)).toBeUndefined();
    expect(catalog.removeIdentifier(websiteRow.id)).toEqual({
      ok: false,
      error: { kind: "identifier-not-found" },
    });
  });

  it("lists and searches stores", () => {
    const walmart = store("Walmart");
    store("Target");
    learn(walmart.id, RECEIPT_1, walmartReceipt);
    expect(catalog.listStores()).toEqual([
      expect.objectContaining({ name: "Target", identifierCount: 0 }),
      expect.objectContaining({ name: "Walmart", identifierCount: 4 }),
    ]);
    expect(catalog.searchStores(" wal ")).toEqual([walmart]);
  });
});
