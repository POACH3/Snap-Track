import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_IMAGE_PIXELS, fitWithinPixels, fitWithinSide } from "./image-size.ts";

describe("fitWithinPixels", () => {
  it("leaves an image already within the limit unchanged (never enlarges)", () => {
    expect(fitWithinPixels({ width: 1000, height: 2000 }, MAX_RECEIPT_IMAGE_PIXELS)).toEqual({
      width: 1000,
      height: 2000,
    });
    expect(fitWithinPixels({ width: 2000, height: 2000 }, MAX_RECEIPT_IMAGE_PIXELS)).toEqual({
      width: 2000,
      height: 2000,
    });
  });

  it("shrinks a 12 MP phone photo to at most 4 MP, keeping its shape", () => {
    const out = fitWithinPixels({ width: 4032, height: 3024 }, MAX_RECEIPT_IMAGE_PIXELS);
    expect(out.width * out.height).toBeLessThanOrEqual(MAX_RECEIPT_IMAGE_PIXELS);
    expect(out.width * out.height).toBeGreaterThan(MAX_RECEIPT_IMAGE_PIXELS * 0.99);
    expect(out.width / out.height).toBeCloseTo(4032 / 3024, 2);
  });

  it("keeps a long 1:5 receipt readable: about 900 × 4500 (SPEC.md §6.1)", () => {
    const out = fitWithinPixels({ width: 2000, height: 10_000 }, MAX_RECEIPT_IMAGE_PIXELS);
    expect(out).toEqual({ width: 894, height: 4472 });
  });

  it("never returns a zero side, and still stays within the limit", () => {
    expect(fitWithinPixels({ width: 1, height: 100_000_000 }, 100)).toEqual({ width: 1, height: 100 });
  });
});

describe("fitWithinSide", () => {
  it("scales the longest side down to the limit", () => {
    expect(fitWithinSide({ width: 900, height: 4500 }, 400)).toEqual({ width: 80, height: 400 });
    expect(fitWithinSide({ width: 4032, height: 3024 }, 400)).toEqual({ width: 400, height: 300 });
  });

  it("never enlarges", () => {
    expect(fitWithinSide({ width: 200, height: 100 }, 400)).toEqual({ width: 200, height: 100 });
  });
});
