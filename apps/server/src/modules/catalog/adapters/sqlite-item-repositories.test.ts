import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { SqliteStoreRepository } from "./sqlite-catalog-repositories.ts";
import { SqliteItemIdentifierRepository, SqliteItemRepository } from "./sqlite-item-repositories.ts";

const STORE = { id: "00000000-0000-4000-8000-000000000001", name: "Fresh Mart" };
const MILK = { id: "00000000-0000-4000-8000-0000000000b1", name: "Milk", nameSource: "model" as const };
const BREAD = { id: "00000000-0000-4000-8000-0000000000b2", name: "bread", nameSource: "printed" as const };

let items: SqliteItemRepository;
let identifiers: SqliteItemIdentifierRepository;
const clock = new FakeClock(new Date("2026-11-15T12:00:00.000Z"));

beforeEach(() => {
  const db = toDrizzle(createTestDatabase());
  new SqliteStoreRepository(db, clock).insert(STORE);
  items = new SqliteItemRepository(db, clock);
  identifiers = new SqliteItemIdentifierRepository(db, clock);
  items.insert(MILK);
  items.insert(BREAD);
});

const barcode = {
  type: "barcode" as const,
  storeId: null,
  value: "00036000291452",
  displayValue: "036000291452",
};
const code = { type: "code" as const, storeId: STORE.id, value: "4417", displayValue: "4417" };

describe("SqliteItemIdentifierRepository", () => {
  it("refuses one barcode for a second item, though barcodes have no store (SPEC.md §5)", () => {
    identifiers.insert({ ...barcode, itemId: MILK.id, firstReceiptId: null });
    expect(() => {
      identifiers.insert({ ...barcode, itemId: BREAD.id, firstReceiptId: null });
    }).toThrow();
  });

  it("refuses a store's code for a second item, and a barcode saved with a store", () => {
    identifiers.insert({ ...code, itemId: MILK.id, firstReceiptId: null });
    expect(() => {
      identifiers.insert({ ...code, itemId: BREAD.id, firstReceiptId: null });
    }).toThrow();
    expect(() => {
      identifiers.insert({ ...barcode, storeId: STORE.id, itemId: BREAD.id, firstReceiptId: null });
    }).toThrow();
  });

  it("lists an item's identifiers with their store, and finds them by value", () => {
    identifiers.insert({
      ...barcode,
      itemId: MILK.id,
      firstReceiptId: "00000000-0000-4000-8000-0000000000aa",
    });
    identifiers.insert({ ...code, itemId: MILK.id, firstReceiptId: null });
    expect(identifiers.listForItem(MILK.id).map((row) => [row.type, row.storeName, row.timesSeen])).toEqual([
      ["barcode", null, 1],
      ["code", "Fresh Mart", 0],
    ]);
    expect(identifiers.findByValues(["4417"]).map((row) => row.itemId)).toEqual([MILK.id]);
  });
});

describe("SqliteItemRepository", () => {
  it("searches names ignoring case, and renaming makes the name the user's", () => {
    expect(items.search("", 10).map((r) => r.item.name)).toEqual(["bread", "Milk"]);
    items.rename(MILK.id, "Whole milk");
    expect(items.findById(MILK.id)).toEqual({ ...MILK, name: "Whole milk", nameSource: "user" });
    expect(items.search("WHOLE", 10)).toHaveLength(1);
  });
});
