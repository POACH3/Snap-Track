import { ExtractedReceipt } from "@snaptrack/contracts";
import { describe, expect, it } from "vitest";
import { checkConsistency } from "./consistency.ts";
import {
  fromExtraction,
  hasUsableAmounts,
  lastFour,
  normalizeUnit,
  purchasedAt,
  type ExtractionResult,
  type LineItem,
} from "./extracted-data.ts";

const UPLOADED = new Date("2026-11-15T18:00:00.000Z");

/** A small grocery receipt that adds up, as the model would return it. */
const groceryReply = {
  store: {
    logoText: "Fresh Mart",
    printedName: "FRESH MART #42",
    phones: [{ number: "(555) 123-4567", label: "Store" }],
    websites: ["freshmart.example"],
    address: { street: "1 Main St", city: "Springfield", state: "IL", zip: "62701" },
  },
  purchaseDate: "2026-11-14",
  purchaseTime: "17:05",
  subtotal: 9.47,
  tax: 0.76,
  taxLines: [{ label: "TAX 8%", rate: "8%", amount: 0.76 }],
  total: 10.23,
  printedSavings: 1.0,
  printedItemCount: 3,
  payments: [{ method: "card", cardBrand: "Visa", cardType: "credit", last4: "XXXXXXXX1234", amount: 10.23 }],
  transactionNumbers: [{ label: "TRN", value: " 000123 " }],
  lines: [
    {
      printedName: "MILK 2% GAL",
      itemCode: "0001234",
      amount: 3.49,
      kind: "item",
      suggestedName: "2% milk, 1 gallon",
    },
    { printedName: "BANANAS", quantity: 2.31, unit: "lbs", unitPrice: 0.59, amount: 1.36, kind: "item" },
    // An item discount, already taken off the amount charged.
    { printedName: "COFFEE", unitPrice: 5.62, amount: 4.62, discount: -1.0, kind: "item" },
    { printedName: "", amount: null },
  ],
  rawText: "FRESH MART #42\n...",
};

const grocery = (): ExtractionResult => fromExtraction(ExtractedReceipt.parse(groceryReply));

describe("fromExtraction", () => {
  it("converts amounts to cents, quantities to thousandths, and normalizes units", () => {
    const { data, lines } = grocery();
    expect(data).toMatchObject({
      purchasedAt: "2026-11-14T17:05",
      subtotalCents: 947,
      taxCents: 76,
      totalCents: 1023,
      printedSavingsCents: 100,
      printedItemCount: 3,
      taxLines: [{ label: "TAX 8%", rate: "8%", amountCents: 76 }],
      transactionNumbers: [{ label: "TRN", value: "000123" }],
    });
    expect(lines.map((l) => [l.rawName, l.quantityMilli, l.unit, l.lineTotalCents, l.discountCents])).toEqual(
      [
        ["MILK 2% GAL", 1000, "each", 349, null],
        ["BANANAS", 2310, "lb", 136, null],
        ["COFFEE", 1000, "each", 462, 100],
      ],
    );
    expect(lines[0]?.suggestedItemName).toBe("2% milk, 1 gallon");
  });

  it("keeps only the last four card digits", () => {
    expect(grocery().data.payments[0]).toMatchObject({
      cardBrand: "Visa",
      cardType: "credit",
      last4: "1234",
      amountCents: 1023,
    });
  });

  it("keeps every store detail as evidence", () => {
    expect(grocery().data.storeEvidence).toMatchObject({
      logoText: "Fresh Mart",
      printedName: "FRESH MART #42",
      phones: [{ number: "(555) 123-4567", label: "Store" }],
      websites: ["freshmart.example"],
      address: { street: "1 Main St", city: "Springfield", state: "IL", zip: "62701" },
      brandGuess: null,
    });
  });

  it("drops lines with neither a name nor an amount, and numbers the rest in order", () => {
    expect(grocery().lines.map((l) => l.position)).toEqual([0, 1, 2]);
  });

  it("treats an empty reply as no data", () => {
    const empty = fromExtraction(ExtractedReceipt.parse({}));
    expect(empty.lines).toEqual([]);
    expect(empty.data.totalCents).toBeNull();
    expect(hasUsableAmounts(empty)).toBe(false);
  });
});

describe("hasUsableAmounts", () => {
  it("is true with a total, or with any line amount", () => {
    expect(hasUsableAmounts(grocery())).toBe(true);
    expect(hasUsableAmounts(fromExtraction(ExtractedReceipt.parse({ total: 5 })))).toBe(true);
    expect(
      hasUsableAmounts(fromExtraction(ExtractedReceipt.parse({ lines: [{ printedName: "X", amount: 1 }] }))),
    ).toBe(true);
    expect(
      hasUsableAmounts(
        fromExtraction(ExtractedReceipt.parse({ lines: [{ printedName: "X" }], rawText: "blurry" })),
      ),
    ).toBe(false);
  });
});

describe("small conversions", () => {
  it("normalizes units, defaulting to each", () => {
    expect(["lbs", "LB", "lb.", "Fl Oz", "ea", "kg", "cases", null].map(normalizeUnit)).toEqual([
      "lb",
      "lb",
      "lb",
      "fl_oz",
      "each",
      "kg",
      "each",
      "each",
    ]);
  });

  it("accepts only real dates and valid times", () => {
    expect(purchasedAt("2026-11-14", "9:05 PM")).toBe("2026-11-14T09:05");
    expect(purchasedAt("2026-11-14", null)).toBe("2026-11-14");
    expect(purchasedAt("2026-11-14", "25:00")).toBe("2026-11-14");
    expect(purchasedAt("2026-02-30", "10:00")).toBeNull();
    expect(purchasedAt("11/14/2026", null)).toBeNull();
  });

  it("finds the last four digits however the card number is masked", () => {
    expect(lastFour("************1234")).toBe("1234");
    expect(lastFour("1234")).toBe("1234");
    expect(lastFour("x12")).toBeNull();
    expect(lastFour(null)).toBeNull();
  });
});

describe("checkConsistency", () => {
  const kinds = (result: ExtractionResult) =>
    checkConsistency(result.data, result.lines, UPLOADED).map((w) => w.kind);
  const withData = (patch: Partial<ExtractionResult["data"]>, lines?: LineItem[]): ExtractionResult => {
    const base = grocery();
    return { data: { ...base.data, ...patch }, lines: lines ?? base.lines };
  };

  it("finds nothing wrong with a receipt that adds up", () => {
    expect(kinds(grocery())).toEqual([]);
  });

  it("flags line totals that don't add up to the subtotal", () => {
    expect(kinds(withData({ subtotalCents: 1000, totalCents: 1076, payments: [] }))).toEqual([
      "lines-vs-subtotal",
    ]);
  });

  it("flags a total that isn't subtotal − discount + tax + tip", () => {
    expect(kinds(withData({ totalCents: 1100, payments: [] }))).toEqual(["subtotal-vs-total"]);
  });

  it("flags tax lines that don't add up to the tax", () => {
    expect(kinds(withData({ taxLines: [{ label: "A", rate: null, amountCents: 50 }] }))).toEqual([
      "tax-lines-vs-tax",
    ]);
  });

  it("flags payments that don't cover the total", () => {
    const data = grocery().data;
    const payment = { ...data.payments[0], amountCents: 900 } as (typeof data.payments)[number];
    expect(kinds(withData({ payments: [payment] }))).toEqual(["payments-vs-total"]);
  });

  it("flags discounts that don't match the printed savings", () => {
    expect(kinds(withData({ printedSavingsCents: 300 }))).toEqual(["discounts-vs-savings"]);
  });

  it("flags an item count that matches neither the lines nor the pieces", () => {
    expect(kinds(withData({ printedItemCount: 7 }))).toEqual(["item-count"]);
  });

  it("flags a line whose quantity × unit price isn't its total plus discount", () => {
    const lines = grocery().lines.map((l) => (l.rawName === "BANANAS" ? { ...l, lineTotalCents: 200 } : l));
    expect(kinds(withData({ subtotalCents: 1011, totalCents: 1087, payments: [] }, lines))).toEqual([
      "line-price",
    ]);
  });

  it("flags dates in the future or more than two years old, with a day of slack", () => {
    expect(kinds(withData({ purchasedAt: "2026-11-16" }))).toEqual([]);
    expect(kinds(withData({ purchasedAt: "2026-11-20" }))).toEqual(["date-in-future"]);
    expect(kinds(withData({ purchasedAt: "2024-11-14" }))).toEqual(["date-too-old"]);
  });

  describe("fees printed after the subtotal", () => {
    // The real AutoZone layout: SUBTOTAL $102.99, CORE CHARGE $10.00, FINAL SUBTOTAL $112.99,
    // tax $8.64, total $121.63. The model reports the first SUBTOTAL, as printed.
    const autoZone = (patch: Record<string, unknown> = {}) =>
      fromExtraction(
        ExtractedReceipt.parse({
          subtotal: 102.99,
          tax: 8.64,
          total: 121.63,
          lines: [
            { printedName: "CTZ10S Duralast Gold Power Sport Battery, EA", amount: 102.99, kind: "item" },
            { printedName: "CORE CHARGE", amount: 10.0, kind: "fee" },
          ],
          ...patch,
        }),
      );

    it("accepts a subtotal that leaves the fees out, adding them back toward the total", () => {
      expect(kinds(autoZone())).toEqual([]);
    });

    it("still accepts a subtotal that includes the fees", () => {
      expect(kinds(autoZone({ subtotal: 112.99 }))).toEqual([]);
    });

    it("still flags a subtotal that matches neither the items nor all lines", () => {
      expect(kinds(autoZone({ subtotal: 107.5 }))).toEqual(["lines-vs-subtotal", "subtotal-vs-total"]);
    });

    it("still flags a total that doesn't add up, counting the fees", () => {
      const warnings = checkConsistency(
        autoZone({ total: 131.63 }).data,
        autoZone({ total: 131.63 }).lines,
        UPLOADED,
      );
      expect(warnings).toEqual([{ kind: "subtotal-vs-total", expectedCents: 12163, printedCents: 13163 }]);
    });

    it("doesn't apply to a receipt without fees", () => {
      const noFees = fromExtraction(
        ExtractedReceipt.parse({
          subtotal: 5,
          total: 8,
          lines: [{ printedName: "A", amount: 8, kind: "item" }],
        }),
      );
      expect(kinds(noFees)).toEqual(["lines-vs-subtotal", "subtotal-vs-total"]);
    });
  });

  it("skips checks whose figures weren't printed", () => {
    const sparse = fromExtraction(
      ExtractedReceipt.parse({ total: 5, lines: [{ printedName: "X", amount: 9 }] }),
    );
    expect(kinds(sparse)).toEqual([]);
  });
});
