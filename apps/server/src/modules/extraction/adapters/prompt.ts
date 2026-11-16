// The instructions sent with every receipt (SPEC.md §6.3.2). The JSON template lists every field
// of `ExtractedReceipt`; prompt.test.ts fails if the two drift apart.
import type { NumberedLabels } from "../domain/labels.ts";

/** Every field the model may fill in, with a hint of its form. */
export const RESPONSE_TEMPLATE = {
  store: {
    logoText: "store name as shown in the logo",
    brandGuess: "your guess at the company, if you recognize the logo or layout",
    printedName: "store name as printed in text",
    legalName: "legal or business name, if printed separately",
    branchName: "the store's own name for this location",
    storeNumber: "store number as printed",
    address: { street: "", city: "", state: "", zip: "" },
    phones: [{ number: "as printed", label: "e.g. Store, Pharmacy" }],
    websites: ["as printed"],
    emails: ["as printed"],
    merchantId: "merchant ID as printed",
  },
  purchaseDate: "YYYY-MM-DD",
  purchaseTime: "HH:MM (24-hour)",
  subtotal: 0.0,
  receiptDiscount: 0.0,
  taxLines: [{ label: "as printed", rate: "as printed, e.g. 8.25%", amount: 0.0 }],
  tax: 0.0,
  tip: 0.0,
  total: 0.0,
  printedSavings: 0.0,
  printedItemCount: 0,
  payments: [
    {
      method: "card, cash, gift card, ...",
      cardBrand: "Visa, Mastercard, ...",
      cardType: "credit or debit",
      last4: "last four card digits",
      amount: 0.0,
      approvalCode: "as printed",
    },
  ],
  transactionNumbers: [{ label: "as printed, e.g. TRN, REG", value: "as printed" }],
  lines: [
    {
      printedName: "the item's description as printed, even if cut off, without its code, quantity or price",
      itemCode: "UPC or SKU, if printed",
      quantity: 1,
      unit: "each, lb, oz, kg, g, gal, l, ml or fl_oz",
      unitPrice: 0.0,
      amount: 0.0,
      discount: 0.0,
      taxCode: "tax letter or code printed next to the line",
      kind: "item or fee",
      suggestedName: "a short readable name for the item",
      category: 0,
      tags: [0],
    },
  ],
  rawText: "the whole receipt, every line, word for word",
};

export const SYSTEM_PROMPT = `You read photos of paper receipts and return what is printed on them as one JSON object.

Rules:
- Read the whole receipt, top and bottom. Store details often appear in the footer as well as the header.
- Report only what is printed. Leave out any field that is not printed or that you cannot read. Never guess or invent a value, except brandGuess and suggestedName, which are your suggestions.
- Report the merchant's own details only. Ignore payment processor and point-of-sale branding (for example "Powered by Toast", "Square", "Clover") and card network logos.
- Amounts are plain numbers as printed, without currency signs (4.99, not "$4.99").
- One entry in "lines" per purchased item or fee, in printed order. "amount" is what was actually charged for the line, after any discount on it. A discount printed on its own line belongs to the item it applies to: put it in that item's "discount" (as a positive number) and do not list it as a separate line. Receipt-wide discounts go in "receiptDiscount".
- A line's "printedName" is its description only, exactly as printed (abbreviations and cut-off words included). Leave out the item code, the quantity (such as "2@4.68"), the price and any tax letter: those go in their own fields. If the description spans two printed lines, join them with one space.
- Bag fees, bottle deposits, shipping and service charges are lines with "kind": "fee".
- Weighed items: quantity is the weight, unit its unit, unitPrice the price per unit.
- Payments: "last4" holds only the last four card digits. "amount" is what was applied to this purchase (for cash, the amount after change).
- "rawText" is a word-for-word transcription of the entire receipt, every line, exactly as printed, with nothing removed or masked.
- When there are several photos, they are consecutive parts of one long receipt, top first. Return one receipt, with every line once.
- "category" and "tags" are your suggestions, from the numbered lists in the message. "category" is the number of the most specific category the item clearly belongs to (a broader one when unsure); leave it out if none fits. "tags" are the numbers of any tags that clearly fit; leave it out if none does. Never use a number that is not on the lists.

Reply with only the JSON object, no other text. Its fields:
${JSON.stringify(RESPONSE_TEMPLATE, null, 2)}`;

/** The user message: what the photos are, then the numbered categories and tags to suggest from. */
export function userText(imageCount: number, labels: NumberedLabels): string {
  const photos =
    imageCount === 1
      ? "Here is the receipt."
      : `These ${imageCount} photos are consecutive parts of one receipt, top of the receipt first.`;
  const list = (lines: readonly string[]) => (lines.length === 0 ? "(none)" : lines.join("\n"));
  return `${photos}\n\nCategories:\n${list(labels.categoryLines)}\n\nTags:\n${list(labels.tagLines)}`;
}
