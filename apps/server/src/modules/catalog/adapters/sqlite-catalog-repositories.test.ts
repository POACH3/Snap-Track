import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { SqliteStoreIdentifierRepository, SqliteStoreRepository } from "./sqlite-catalog-repositories.ts";

const WALMART = { id: "00000000-0000-4000-8000-000000000001", name: "Walmart" };
const TARGET = { id: "00000000-0000-4000-8000-000000000002", name: "Target" };
const RECEIPT = "00000000-0000-4000-8000-0000000000aa";

let stores: SqliteStoreRepository;
let identifiers: SqliteStoreIdentifierRepository;
const clock = new FakeClock(new Date("2026-11-15T12:00:00.000Z"));

beforeEach(() => {
  const db = toDrizzle(createTestDatabase());
  stores = new SqliteStoreRepository(db, clock);
  identifiers = new SqliteStoreIdentifierRepository(db, clock);
  stores.insert(WALMART);
  stores.insert(TARGET);
});

const phone = { type: "phone" as const, value: "15551234567", displayValue: "(555) 123-4567" };

describe("SqliteStoreRepository", () => {
  it("keeps store names unique, ignoring case", () => {
    expect(stores.insert({ id: "00000000-0000-4000-8000-000000000003", name: "WALMART" })).toBe(false);
    expect(stores.findByName("walmart")).toEqual(WALMART);
    expect(stores.rename(TARGET.id, "walMart")).toBe(false);
    expect(stores.rename(WALMART.id, "WalMart")).toBe(true);
    expect(stores.findById(WALMART.id)?.name).toBe("WalMart");
  });

  it("searches names ignoring case, alphabetically, treating % and _ as plain text", () => {
    expect(stores.search("", 10).map((s) => s.name)).toEqual(["Target", "Walmart"]);
    expect(stores.search("MAR", 10)).toEqual([WALMART]);
    expect(stores.search("%", 10)).toEqual([]);
  });

  it("lists stores with their identifier counts, and every name they go by", () => {
    identifiers.insert({ storeId: WALMART.id, ...phone, firstReceiptId: RECEIPT });
    identifiers.insert({
      storeId: WALMART.id,
      type: "logo_text",
      value: "walmart supercenter",
      displayValue: "Walmart Supercenter",
      firstReceiptId: RECEIPT,
    });
    expect(stores.listWithCounts()).toEqual([
      { store: TARGET, identifierCount: 0 },
      { store: WALMART, identifierCount: 2 },
    ]);
    expect(stores.knownStores().find((s) => s.id === WALMART.id)?.names).toEqual([
      "walmart",
      "walmart supercenter",
    ]);
  });
});

describe("SqliteStoreIdentifierRepository", () => {
  it("lets one identifier point to only one store", () => {
    identifiers.insert({ storeId: WALMART.id, ...phone, firstReceiptId: RECEIPT });
    expect(() => {
      identifiers.insert({ storeId: TARGET.id, ...phone, firstReceiptId: RECEIPT });
    }).toThrow();
  });

  it("finds identifiers by value, of any type", () => {
    identifiers.insert({
      storeId: WALMART.id,
      type: "name",
      value: "walmart",
      displayValue: "WALMART",
      firstReceiptId: RECEIPT,
    });
    identifiers.insert({
      storeId: TARGET.id,
      type: "logo_text",
      value: "walmart",
      displayValue: "Walmart",
      firstReceiptId: RECEIPT,
    });
    expect(
      identifiers
        .findByValues(["walmart", "walmart"])
        .map((row) => row.storeId)
        .sort(),
    ).toEqual([WALMART.id, TARGET.id].sort());
    expect(identifiers.findByValues([])).toEqual([]);
  });

  it("counts sightings, moves, marks and removes", () => {
    identifiers.insert({ storeId: WALMART.id, ...phone, firstReceiptId: RECEIPT });
    const [row] = identifiers.listForStore(WALMART.id);
    if (row === undefined) throw new Error("not saved");
    expect(row).toMatchObject({ timesSeen: 1, state: "active", lastSeenAt: "2026-11-15T12:00:00.000Z" });

    identifiers.markSeen(row.id);
    expect(identifiers.findById(row.id)?.timesSeen).toBe(2);

    identifiers.setState(row.id, "ambiguous");
    identifiers.move(row.id, TARGET.id, RECEIPT);
    expect(identifiers.findById(row.id)).toMatchObject({ storeId: TARGET.id, state: "active", timesSeen: 1 });

    identifiers.remove(row.id);
    expect(identifiers.findById(row.id)).toBeUndefined();
  });

  it("records an identifier added by hand as never seen on a receipt", () => {
    identifiers.insert({ storeId: WALMART.id, ...phone, firstReceiptId: null });
    expect(identifiers.listForStore(WALMART.id)[0]).toMatchObject({
      timesSeen: 0,
      lastSeenAt: null,
      firstReceiptId: null,
    });
  });
});
