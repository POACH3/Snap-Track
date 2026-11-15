import { describe, expect, it } from "vitest";
import { detectImageFormat } from "./image-format.ts";
import { receiptImageKeys } from "./image-keys.ts";
import { planStoredImage, thumbnailSize } from "./image-plan.ts";
import { decodeCursor, encodeCursor, normalizeTimestamp } from "./list-cursor.ts";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...new TextEncoder().encode(p)] : p)));

describe("detectImageFormat", () => {
  it("recognizes JPEG and PNG by their signatures", () => {
    expect(detectImageFormat(bytes([0xff, 0xd8, 0xff, 0xe0], "rest"))).toBe("jpeg");
    expect(detectImageFormat(bytes([0x89], "PNG\r\n\x1a\n", "rest"))).toBe("png");
  });

  it("recognizes HEIC and generic HEIF brands", () => {
    for (const brand of ["heic", "heix", "mif1", "msf1"]) {
      expect(detectImageFormat(bytes([0, 0, 0, 0x24], "ftyp", brand, "...."))).toBe("heic");
    }
  });

  it("refuses other files, whatever they are named", () => {
    expect(detectImageFormat(bytes("hello, this is text"))).toBeUndefined();
    expect(detectImageFormat(bytes([0, 0, 0, 0x20], "ftyp", "isom", "...."))).toBeUndefined(); // MP4 video
    expect(detectImageFormat(bytes("GIF89a......"))).toBeUndefined();
    expect(detectImageFormat(new Uint8Array())).toBeUndefined();
    expect(detectImageFormat(bytes([0xff, 0xd8]))).toBeUndefined();
  });
});

describe("planStoredImage", () => {
  it("keeps a JPEG the client already shrank", () => {
    expect(planStoredImage("jpeg", { width: 1500, height: 2600 })).toEqual({ kind: "keep" });
    expect(planStoredImage("jpeg", { width: 2000, height: 2000 })).toEqual({ kind: "keep" });
  });

  it("shrinks a JPEG over the pixel limit", () => {
    const plan = planStoredImage("jpeg", { width: 4032, height: 3024 });
    expect(plan.kind).toBe("convert");
    if (plan.kind === "convert") expect(plan.size.width * plan.size.height).toBeLessThanOrEqual(4_000_000);
  });

  it("converts HEIC and PNG to JPEG, at their own size when already small", () => {
    expect(planStoredImage("heic", { width: 1000, height: 1000 })).toEqual({
      kind: "convert",
      size: { width: 1000, height: 1000 },
    });
    expect(planStoredImage("png", { width: 800, height: 600 })).toEqual({
      kind: "convert",
      size: { width: 800, height: 600 },
    });
  });

  it("makes thumbnails at most 400 px on the longest side", () => {
    expect(thumbnailSize({ width: 894, height: 4472 })).toEqual({ width: 80, height: 400 });
    expect(thumbnailSize({ width: 300, height: 200 })).toEqual({ width: 300, height: 200 });
  });
});

describe("receiptImageKeys", () => {
  it("puts both files under the receipt, named by the image id", () => {
    expect(receiptImageKeys("r1", "i1")).toEqual({
      image: "receipts/r1/i1.jpg",
      thumbnail: "receipts/r1/i1-thumb.jpg",
    });
  });
});

describe("list cursor", () => {
  const position = { capturedAt: "2026-11-15T10:20:30.000Z", id: "0b6d7a4e-3f0c-4a51-9b7e-2c1d8e9f0a12" };

  it("round-trips", () => {
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it("refuses cursors it didn't make", () => {
    for (const bad of [
      "",
      "abc",
      "2026-11-15~x",
      `${position.capturedAt}~${position.id}~more`,
      "x~" + position.id,
    ]) {
      expect(decodeCursor(bad)).toBeUndefined();
    }
  });

  it("stores capture times in one exact form", () => {
    expect(normalizeTimestamp("2026-11-15T10:20:30Z")).toBe("2026-11-15T10:20:30.000Z");
    expect(normalizeTimestamp("2026-11-15T10:20:30.5Z")).toBe("2026-11-15T10:20:30.500Z");
  });
});
