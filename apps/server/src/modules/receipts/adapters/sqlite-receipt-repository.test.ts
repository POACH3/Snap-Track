// Repository test on in-memory SQLite (SPEC.md §3.5): the constraints the use cases rely on.
import { FakeClock } from "@snaptrack/core/testing";
import { describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { SqliteReceiptRepository } from "./sqlite-receipt-repository.ts";

const receipt = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  loggedByUserId: "11111111-1111-4111-8111-111111111111",
  source: "photo",
  status: "uploaded",
  capturedAt: "2026-11-15T10:00:00.000Z",
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
});
