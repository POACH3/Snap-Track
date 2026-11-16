import type { ReceiptDetail } from "@snaptrack/contracts";
import { describe, expect, it } from "vitest";
import {
  blankLine,
  draftFromForm,
  formFromDraft,
  moneyText,
  parseMoney,
  parseQuantity,
  quantityText,
  splitOf,
  warningField,
} from "./receipt-form.ts";

const draft: ReceiptDetail["draft"] = {
  purchasedAt: "2026-11-13T18:18",
  subtotalCents: 2176,
  discountCents: null,
  taxCents: 142,
  tipCents: null,
  totalCents: 2318,
  printedSavingsCents: null,
  printedItemCount: 5,
  taxLines: [{ label: "TAX", rate: "6.5%", amountCents: 142 }],
  payments: [
    {
      method: "card",
      cardBrand: "Visa",
      cardType: "credit",
      last4: "4821",
      amountCents: 2318,
      approvalCode: "A1",
    },
  ],
  transactionNumbers: [{ label: "TRANS", value: "0042" }],
  storeEvidence: {
    logoText: "TRADER JOE'S",
    brandGuess: "Trader Joe's",
    printedName: "TRADER JOE'S #112",
    legalName: null,
    branchName: null,
    storeNumber: "112",
    address: { street: "1 Main St", city: "Pasadena", state: "CA", zip: "91101" },
    phones: [{ number: "(626) 555-0142", label: null }],
    websites: [],
    emails: [],
    merchantId: null,
  },
  note: null,
  lines: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      kind: "item",
      rawName: "BANANAS",
      itemCode: null,
      quantityMilli: 2310,
      unit: "lb",
      unitPriceCents: 59,
      lineTotalCents: 136,
      discountCents: null,
      taxCode: "F",
      suggestedItemName: "Bananas",
      item: null,
      itemRef: null,
      itemSuggestion: { kind: "new", name: "Bananas" },
    },
  ],
};

describe("amounts and quantities as typed", () => {
  it.each([
    ["12.34", 1234],
    ["$1,234.5", 123450],
    ["-3", -300],
    [".5", 50],
    ["", null],
    ["12.345", undefined],
    ["abc", undefined],
    ["-", undefined],
  ])("money %j → %j", (text, cents) => {
    expect(parseMoney(text)).toBe(cents);
  });

  it("writes cents back without a currency sign", () => {
    expect(moneyText(1234)).toBe("12.34");
    expect(moneyText(-5)).toBe("-0.05");
    expect(moneyText(null)).toBe("");
  });

  it("reads quantities in exact thousandths", () => {
    expect(parseQuantity("2.31")).toBe(2310);
    expect(parseQuantity("1")).toBe(1000);
    expect(parseQuantity("0")).toBeUndefined();
    expect(parseQuantity("1.2345")).toBeUndefined();
    expect(quantityText(2310)).toBe("2.31");
    expect(quantityText(1000)).toBe("1");
  });
});

describe("the form and the draft", () => {
  it("round-trips a draft through the form unchanged", () => {
    const result = draftFromForm(formFromDraft(draft));
    expect(result).toEqual({
      draft: {
        ...draft,
        // The form doesn't send the model's suggested name; the server keeps it.
        lines: draft.lines.map((line) => ({
          id: line.id,
          item: null,
          kind: line.kind,
          rawName: line.rawName,
          itemCode: line.itemCode,
          quantityMilli: line.quantityMilli,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
          discountCents: line.discountCents,
          taxCode: line.taxCode,
        })),
      },
    });
  });

  it("names every field that isn't an amount, and sends nothing", () => {
    const form = formFromDraft(draft);
    const line = form.lines[0];
    if (line === undefined) throw new Error("no line");
    const result = draftFromForm({
      ...form,
      total: "lots",
      lines: [{ ...line, lineTotal: "1.2.3", quantity: "0" }],
    });
    expect(result).toEqual({
      errors: {
        total: "Enter an amount, like 4.99.",
        [`lines.${line.key}.lineTotal`]: "Enter an amount, like 4.99.",
        [`lines.${line.key}.quantity`]: "Enter a quantity above zero.",
      },
    });
  });

  it("refuses more than the last four card digits", () => {
    const form = formFromDraft(draft);
    const payment = form.payments[0];
    if (payment === undefined) throw new Error("no payment");
    const result = draftFromForm({ ...form, payments: [{ ...payment, last4: "41111234" }] });
    expect("errors" in result && result.errors[`payments.${payment.key}.last4`]).toBeTruthy();
  });

  it("drops empty rows and an empty address", () => {
    const form = formFromDraft({ ...draft, storeEvidence: { ...draft.storeEvidence, address: null } });
    form.evidence.phones.push({ key: "x", number: " ", label: "" });
    const result = draftFromForm(form);
    expect("draft" in result && result.draft.storeEvidence).toMatchObject({
      address: null,
      phones: [{ number: "(626) 555-0142" }],
    });
  });

  it("adds a line, and splits one into a copy with empty amounts", () => {
    const line = { ...blankLine(), rawName: "AVOCADOS 2 @ 1.25", itemCode: "123", lineTotal: "2.50" };
    expect(splitOf(line)).toMatchObject({ rawName: "AVOCADOS 2 @ 1.25", itemCode: "123", lineTotal: "" });
    expect(splitOf(line).id).toBeUndefined();
    expect(splitOf(line).key).not.toBe(line.key);
  });

  it("puts a line's warning next to that line", () => {
    const form = formFromDraft(draft);
    expect(
      warningField({ kind: "line-price", position: 0, expectedCents: 1, printedCents: 2 }, form.lines),
    ).toBe(`lines.${form.lines[0]?.key ?? ""}.lineTotal`);
    expect(warningField({ kind: "lines-vs-subtotal", expectedCents: 1, printedCents: 2 }, form.lines)).toBe(
      "subtotal",
    );
  });
});
