// Repository test on in-memory SQLite (SPEC.md §3.5): the constraints the use cases rely on.
import { ExtractedReceipt } from "@snaptrack/contracts";
import { FakeClock } from "@snaptrack/core/testing";
import { describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { fromExtraction } from "../domain/extracted-data.ts";
import { SqliteReceiptRepository } from "./sqlite-receipt-repository.ts";

const receipt = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  loggedByUserId: "11111111-1111-4111-8111-111111111111",
  source: "photo",
  status: "uploaded",
  capturedAt: "2026-11-15T10:00:00.000Z",
  totalCents: null,
} as const;
const image = (id: string, position: number) => ({
  id,
  receiptId: receipt.id,
  position,
  imageKey: `receipts/${receipt.id}/${id}.jpg`,
  thumbnailKey: `receipts/${receipt.id}/${id}-thumb.jpg`,
  imageSha256: "0".repeat(64),
});

function setup() {
  const sqlite = createTestDatabase();
  return { sqlite, repo: new SqliteReceiptRepository(toDrizzle(sqlite), new FakeClock()) };
}

describe("SqliteReceiptRepository", () => {
  it("returns images in position order whatever order they were saved in", () => {
    const { repo } = setup();
    repo.insert(receipt, [image("i2", 2), image("i0", 0), image("i1", 1)]);
    expect(repo.findById(receipt.id)?.images.map((i) => i.id)).toEqual(["i0", "i1", "i2"]);
  });

  it("refuses a second receipt with the same id, saving nothing", () => {
    const { repo } = setup();
    expect(repo.insert(receipt, [image("i0", 0)])).toBe(true);
    expect(repo.insert(receipt, [image("other", 0)])).toBe(false);
    expect(repo.findImage("other")).toBeUndefined();
  });

  it("refuses two images at the same position", () => {
    const { repo } = setup();
    expect(() => repo.insert(receipt, [image("i0", 0), image("i1", 0)])).toThrow(/UNIQUE/);
  });

  it("refuses a status outside the lifecycle", () => {
    const { sqlite } = setup();
    expect(() =>
      sqlite
        .prepare(
          "insert into receipts (id, logged_by_user_id, source, status, captured_at, created_at, updated_at) values ('x', 'u', 'photo', 'lost', 'now', 'now', 'now')",
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it("deletes a receipt's image rows with it", () => {
    const { sqlite, repo } = setup();
    repo.insert(receipt, [image("i0", 0)]);
    sqlite.prepare("delete from receipts where id = ?").run(receipt.id);
    expect(repo.findImage("i0")).toBeUndefined();
  });

  it("changes the status only from the allowed ones", () => {
    const { repo } = setup();
    repo.insert(receipt, []);
    expect(repo.setStatus(receipt.id, "extracting", ["uploaded"])).toBe(true);
    expect(repo.setStatus(receipt.id, "unreviewed", ["uploaded"])).toBe(false);
    expect(repo.findById(receipt.id)?.receipt.status).toBe("extracting");
  });

  it("saves extracted data, and saving again replaces the line items", () => {
    const { sqlite, repo } = setup();
    repo.insert(receipt, []);
    const first = fromExtraction(
      ExtractedReceipt.parse({
        total: 10.23,
        lines: [
          { printedName: "A", amount: 1 },
          { printedName: "B", amount: 2 },
        ],
      }),
    );
    repo.saveExtraction(receipt.id, first, "unreviewed", undefined);
    expect(repo.findById(receipt.id)?.receipt).toMatchObject({ status: "unreviewed", totalCents: 1023 });
    const second = fromExtraction(
      ExtractedReceipt.parse({ total: 5, lines: [{ printedName: "C", amount: 5 }] }),
    );
    repo.saveExtraction(receipt.id, second, "unreviewed", undefined);
    const names = sqlite.prepare("select raw_name from line_items order by position").all() as {
      raw_name: string;
    }[];
    expect(names.map((n) => n.raw_name)).toEqual(["C"]);
  });

  it("stores the JSON fields and reads them back", () => {
    const { sqlite, repo } = setup();
    repo.insert(receipt, []);
    const result = fromExtraction(
      ExtractedReceipt.parse({
        payments: [{ cardBrand: "Visa", last4: "1234", amount: 3 }],
        store: { printedName: "SHOP" },
      }),
    );
    repo.saveExtraction(receipt.id, result, "review_required", undefined);
    const row = sqlite.prepare("select payments, store_evidence from receipts").get() as {
      payments: string;
      store_evidence: string;
    };
    expect(JSON.parse(row.payments)).toEqual([
      expect.objectContaining({ cardBrand: "Visa", last4: "1234", amountCents: 300 }),
    ]);
    expect(JSON.parse(row.store_evidence)).toMatchObject({ printedName: "SHOP" });
  });
});
