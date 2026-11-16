// Use-case tests (SPEC.md §3.5): real SQLite in memory, fakes for files, images and clock.
import { SqliteCatalogMergeListener } from "../adapters/sqlite-catalog-merge-listener.ts";
import { SqlitePurchaseLabelUsage } from "../adapters/sqlite-purchase-label-usage.ts";
import { newId } from "@snaptrack/core";
import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle, type Sqlite } from "../../../platform/db/connection.ts";
import { SqliteTransaction } from "../../../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { createCatalogModule } from "../../catalog/index.ts";
import { SqliteReceiptRepository } from "../adapters/sqlite-receipt-repository.ts";
import { detectImageFormat } from "../domain/image-format.ts";
import { FakeImageConverter } from "../testing/fake-image-converter.ts";
import { fakeImage, readFakeImageSize } from "../testing/fake-images.ts";
import { InMemoryFileStore } from "../testing/in-memory-file-store.ts";
import { createReceiptsService, type ReceiptsService } from "./receipts-service.ts";

const SAM = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222";
const users = {
  displayNames: () =>
    new Map([
      [SAM, "Sam"],
      [ALEX, "Alex"],
    ]),
};

let sqlite: Sqlite;
let files: InMemoryFileStore;
let converter: FakeImageConverter;
let service: ReceiptsService;

beforeEach(() => {
  sqlite = createTestDatabase();
  files = new InMemoryFileStore();
  converter = new FakeImageConverter();
  const clock = new FakeClock();
  const transaction = new SqliteTransaction(sqlite);
  service = createReceiptsService({
    receipts: new SqliteReceiptRepository(toDrizzle(sqlite), clock),
    files,
    converter,
    users,
    catalog: createCatalogModule({
      db: toDrizzle(sqlite),
      clock,
      transaction,
      usage: new SqlitePurchaseLabelUsage(toDrizzle(sqlite)),
      mergeListener: new SqliteCatalogMergeListener(toDrizzle(sqlite)),
    }).service,
    transaction,
  });
});

const count = (table: string) =>
  (sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
const smallJpeg = (tag = "") => fakeImage("jpeg", { width: 1500, height: 2600 }, tag);

function put(
  images: Uint8Array<ArrayBuffer>[],
  options: { id?: string; user?: string; capturedAt?: string } = {},
) {
  return service.putReceipt(
    { id: options.id ?? newId(), capturedAt: options.capturedAt ?? "2026-11-15T10:00:00Z", images },
    options.user ?? SAM,
  );
}

describe("putReceipt", () => {
  it("saves an uploaded receipt with the signed-in person and its images in order", async () => {
    const result = await put([smallJpeg("top"), smallJpeg("middle"), smallJpeg("bottom")]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: "uploaded",
      source: "photo",
      capturedAt: "2026-11-15T10:00:00.000Z",
      loggedBy: { id: SAM, displayName: "Sam" },
    });
    expect(result.value.images.map((image) => image.position)).toEqual([0, 1, 2]);
    // Stored in order: each position's file is the photo sent at that position.
    for (const [position, tag] of ["top", "middle", "bottom"].entries()) {
      const stored = await service.readImage(result.value.images[position]?.id ?? "", "image");
      expect(new TextDecoder().decode(stored)).toContain(tag);
    }
  });

  it("is idempotent: the same upload twice makes one receipt and changes nothing", async () => {
    const id = newId();
    const first = await put([smallJpeg()], { id });
    const second = await put([smallJpeg(), smallJpeg()], { id, user: ALEX });
    expect(second).toEqual(first);
    expect(count("receipts")).toBe(1);
    expect(count("receipt_images")).toBe(1);
    expect(files.files.size).toBe(2); // one image, one thumbnail
  });

  it("keeps a JPEG the client already shrank as sent, and makes a thumbnail", async () => {
    const sent = smallJpeg("as-sent");
    const result = await put([sent]);
    if (!result.ok) throw new Error("upload failed");
    const imageId = result.value.images[0]?.id ?? "";
    expect(await service.readImage(imageId, "image")).toEqual(sent);
    const thumbnail = await service.readImage(imageId, "thumbnail");
    expect(thumbnail && readFakeImageSize(thumbnail)).toEqual({ width: 231, height: 400 });
  });

  it("converts HEIC to a JPEG within the pixel limit", async () => {
    const result = await put([fakeImage("heic", { width: 4032, height: 3024 })]);
    if (!result.ok) throw new Error("upload failed");
    const stored = await service.readImage(result.value.images[0]?.id ?? "", "image");
    expect(stored && detectImageFormat(stored)).toBe("jpeg");
    const size = stored && readFakeImageSize(stored);
    expect(size && size.width * size.height).toBeLessThanOrEqual(4_000_000);
  });

  it("refuses a file that isn't a supported image, naming its position, and saves nothing", async () => {
    const text = new Uint8Array(new TextEncoder().encode("not an image"));
    expect(await put([smallJpeg(), text])).toEqual({
      ok: false,
      error: { kind: "unsupported-image", position: 1 },
    });
    expect(count("receipts")).toBe(0);
    expect(files.files.size).toBe(0);
  });

  it("refuses an image that looks right but can't be read", async () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(await put([broken])).toEqual({ ok: false, error: { kind: "unsupported-image", position: 0 } });
  });

  it("leaves no files and no rows when a conversion fails part way", async () => {
    converter.failAfter = 2; // image 1 converts, then its second image's conversion fails
    const result = await put([
      fakeImage("heic", { width: 100, height: 100 }),
      fakeImage("heic", { width: 100, height: 100 }),
    ]);
    expect(result.ok).toBe(false);
    expect(count("receipts")).toBe(0);
    expect(files.files.size).toBe(0);
  });

  it("deletes the files it wrote when writing fails part way, and saves no receipt", async () => {
    let puts = 0;
    const realPut = files.put.bind(files);
    files.put = (key, bytes) => (++puts === 3 ? Promise.reject(new Error("disk full")) : realPut(key, bytes));
    await expect(put([smallJpeg(), smallJpeg()])).rejects.toThrow("disk full");
    expect(count("receipts")).toBe(0);
    expect(files.files.size).toBe(0);
  });

  it("when two copies of one upload race, keeps one receipt and the loser's files are removed", async () => {
    const id = newId();
    const [a, b] = await Promise.all([put([smallJpeg("a")], { id }), put([smallJpeg("b")], { id })]);
    expect(a).toEqual(b);
    expect(count("receipts")).toBe(1);
    expect(count("receipt_images")).toBe(1);
    expect(files.files.size).toBe(2);
  });
});

describe("listReceipts", () => {
  it("lists newest capture first, with paging that visits every receipt once", async () => {
    const times = ["2026-11-01T09:00:00Z", "2026-11-03T09:00:00Z", "2026-11-02T09:00:00Z"];
    for (const capturedAt of [...times, times[1] ?? ""]) await put([smallJpeg()], { capturedAt });

    const first = service.listReceipts({ cursor: undefined, limit: 2 });
    if (!first.ok) throw new Error("list failed");
    expect(first.value.receipts.map((r) => r.capturedAt.slice(0, 10))).toEqual(["2026-11-03", "2026-11-03"]);
    expect(first.value.nextCursor).not.toBeNull();

    const second = service.listReceipts({ cursor: first.value.nextCursor ?? undefined, limit: 2 });
    if (!second.ok) throw new Error("list failed");
    expect(second.value.receipts.map((r) => r.capturedAt.slice(0, 10))).toEqual(["2026-11-02", "2026-11-01"]);
    expect(second.value.nextCursor).toBeNull();

    const ids = [...first.value.receipts, ...second.value.receipts].map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("names who logged each receipt", async () => {
    await put([smallJpeg()], { user: ALEX });
    const result = service.listReceipts({ cursor: undefined, limit: 10 });
    expect(result.ok && result.value.receipts[0]?.loggedBy).toEqual({ id: ALEX, displayName: "Alex" });
  });

  it("refuses a cursor it didn't make", () => {
    expect(service.listReceipts({ cursor: "nonsense", limit: 10 })).toEqual({
      ok: false,
      error: { kind: "invalid-cursor" },
    });
  });
});

describe("getReceipt and readImage", () => {
  it("returns undefined for unknown receipts and images", async () => {
    expect(service.getReceipt(newId())).toBeUndefined();
    expect(await service.readImage(newId(), "image")).toBeUndefined();
  });
});
