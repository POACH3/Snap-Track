import { describe, expect, it } from "vitest";
import { ExtractedReceipt } from "./extraction.ts";

describe("ExtractedReceipt", () => {
  it("accepts an empty reply: every field is optional", () => {
    expect(ExtractedReceipt.parse({})).toMatchObject({
      lines: [],
      payments: [],
      taxLines: [],
      transactionNumbers: [],
    });
  });

  it("turns a field of the wrong type into null instead of failing the receipt", () => {
    const parsed = ExtractedReceipt.parse({
      total: "about ten",
      subtotal: { x: 1 },
      rawText: 42,
      store: "Walmart",
    });
    expect(parsed).toMatchObject({ total: null, subtotal: null, rawText: null, store: null });
  });

  it("reads amounts written as text", () => {
    const parsed = ExtractedReceipt.parse({ total: "$1,234.50", tax: " 0.76 ", tip: "-2.00" });
    expect([parsed.total, parsed.tax, parsed.tip]).toEqual([1234.5, 0.76, -2]);
  });

  it("drops unreadable entries from a list and keeps the rest", () => {
    const parsed = ExtractedReceipt.parse({
      lines: [{ printedName: "MILK", amount: 3.49, kind: "freebie" }, "junk", null],
      payments: [{ cardBrand: "Visa", cardType: "prepaid" }],
      transactionNumbers: [{ label: "TRN" }, { label: "REG", value: "4" }],
    });
    expect(parsed.lines).toEqual([
      expect.objectContaining({ printedName: "MILK", amount: 3.49, kind: null }),
    ]);
    expect(parsed.payments).toEqual([expect.objectContaining({ cardBrand: "Visa", cardType: null })]);
    expect(parsed.transactionNumbers).toEqual([{ label: "REG", value: "4" }]);
  });

  it("refuses something that isn't an object at all", () => {
    expect(ExtractedReceipt.safeParse("a receipt").success).toBe(false);
    expect(ExtractedReceipt.safeParse([1]).success).toBe(false);
  });
});
