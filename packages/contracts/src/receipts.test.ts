import { describe, expect, it } from "vitest";
import { StoreName } from "./catalog.ts";
import { ConfirmReceiptInput, ReceiptDraft } from "./receipts.ts";

const emptyDraft = {
  purchasedAt: null,
  subtotalCents: null,
  discountCents: null,
  taxCents: null,
  tipCents: null,
  totalCents: null,
  printedSavingsCents: null,
  printedItemCount: null,
  taxLines: [],
  payments: [],
  transactionNumbers: [],
  storeEvidence: {
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
  },
  note: null,
  lines: [],
};

const confirm = (draft: object) => ({
  id: "00000000-0000-4000-8000-000000000001",
  expectedUpdatedAt: "2026-11-15T12:00:00.000Z",
  store: { kind: "existing", storeId: "00000000-0000-4000-8000-000000000002" },
  draft,
});

describe("ConfirmReceiptInput", () => {
  it("needs a total, and nothing else", () => {
    expect(ConfirmReceiptInput.safeParse(confirm(emptyDraft)).success).toBe(false);
    expect(ConfirmReceiptInput.safeParse(confirm({ ...emptyDraft, totalCents: 1234 })).success).toBe(true);
  });

  it("needs a store", () => {
    const input = { ...confirm({ ...emptyDraft, totalCents: 1 }), store: undefined };
    expect(ConfirmReceiptInput.safeParse(input).success).toBe(false);
  });
});

describe("ReceiptDraft", () => {
  it("accepts negative amounts (returns are deferred, not blocked)", () => {
    const draft = {
      ...emptyDraft,
      totalCents: -500,
      lines: [
        {
          kind: "item",
          rawName: "RETURN",
          itemCode: null,
          quantityMilli: 1000,
          unit: "each",
          unitPriceCents: null,
          lineTotalCents: -500,
          discountCents: null,
          taxCode: null,
        },
      ],
    };
    expect(ReceiptDraft.safeParse(draft).success).toBe(true);
  });

  it("keeps only the last four digits of a card", () => {
    const payment = {
      method: "card",
      cardBrand: "Visa",
      cardType: "credit",
      amountCents: 100,
      approvalCode: null,
    };
    expect(ReceiptDraft.safeParse({ ...emptyDraft, payments: [{ ...payment, last4: "1234" }] }).success).toBe(
      true,
    );
    expect(
      ReceiptDraft.safeParse({ ...emptyDraft, payments: [{ ...payment, last4: "41111234" }] }).success,
    ).toBe(false);
  });

  it("refuses a malformed purchase date", () => {
    expect(ReceiptDraft.safeParse({ ...emptyDraft, purchasedAt: "2026-11-15T17:05" }).success).toBe(true);
    expect(ReceiptDraft.safeParse({ ...emptyDraft, purchasedAt: "Nov 15" }).success).toBe(false);
  });
});

describe("StoreName", () => {
  it("is trimmed and never empty", () => {
    expect(StoreName.parse("  Walmart ")).toBe("Walmart");
    expect(StoreName.safeParse("   ").success).toBe(false);
  });
});
