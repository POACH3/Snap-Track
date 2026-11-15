import { z } from "zod";

// What the vision model returns for one receipt (SPEC.md §6.3.2). Every field is optional:
// the model leaves out anything not printed and never invents a value. Amounts are decimals as
// printed (4.99); the server converts them to integer cents. Lenient on purpose: a field the
// model gets wrong becomes null rather than failing the whole receipt (see `lenient`).

/** A field that is null when missing or of the wrong type, instead of failing the receipt. */
const lenient = <T extends z.ZodType>(schema: T) => schema.nullish().catch(null);
const text = lenient(z.string());
/** Models sometimes write amounts as text ("$1,234.50"); those count too. */
const toNumber = (value: unknown) =>
  typeof value === "string" && /^\s*-?\$?[\d,]*\.?\d+\s*$/.test(value)
    ? Number(value.replace(/[$,\s]/g, ""))
    : value;
const amount = lenient(z.preprocess(toNumber, z.number()));
/** A list whose unreadable entries are dropped. */
const list = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .nullish()
    .catch(null)
    .transform((values) =>
      (values ?? []).flatMap((value) => {
        const parsed = item.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      }),
    );

export const ExtractedStore = z.object({
  logoText: text,
  brandGuess: text,
  printedName: text,
  legalName: text,
  branchName: text,
  storeNumber: text,
  address: lenient(z.object({ street: text, city: text, state: text, zip: text })),
  phones: list(z.object({ number: z.string(), label: text })),
  websites: list(z.string()),
  emails: list(z.string()),
  merchantId: text,
});

export const ExtractedLine = z.object({
  printedName: text,
  itemCode: text,
  quantity: amount,
  unit: text,
  unitPrice: amount,
  /** The amount actually charged for the line, after any item discount. */
  amount,
  /** Savings on this line, already included in `amount`. */
  discount: amount,
  taxCode: text,
  kind: lenient(z.enum(["item", "fee"])),
  suggestedName: text,
});

export const ExtractedTaxLine = z.object({
  label: text,
  rate: text,
  amount: z.preprocess(toNumber, z.number()),
});

export const ExtractedPayment = z.object({
  method: text,
  cardBrand: text,
  cardType: lenient(z.enum(["credit", "debit"])),
  last4: text,
  amount,
  approvalCode: text,
});

export const ExtractedTransactionNumber = z.object({ label: text, value: z.string() });

export const ExtractedReceipt = z.object({
  store: ExtractedStore.nullish().catch(null),
  /** As printed: date `YYYY-MM-DD`, time `HH:MM` (24-hour). */
  purchaseDate: text,
  purchaseTime: text,
  subtotal: amount,
  /** Receipt-wide discounts only; per-item discounts are on the lines. */
  receiptDiscount: amount,
  taxLines: list(ExtractedTaxLine),
  /** Total of all tax lines. */
  tax: amount,
  tip: amount,
  total: amount,
  printedSavings: amount,
  printedItemCount: amount,
  payments: list(ExtractedPayment),
  transactionNumbers: list(ExtractedTransactionNumber),
  lines: list(ExtractedLine),
  /** Every line of the receipt, word for word, exactly as printed. */
  rawText: text,
});
export type ExtractedReceipt = z.output<typeof ExtractedReceipt>;
export type ExtractedLine = z.output<typeof ExtractedLine>;

// Stored JSON shapes on `receipts` (SPEC.md §5). Amounts in integer cents.

export const StoreEvidence = z.object({
  logoText: z.string().nullable(),
  brandGuess: z.string().nullable(),
  printedName: z.string().nullable(),
  legalName: z.string().nullable(),
  branchName: z.string().nullable(),
  storeNumber: z.string().nullable(),
  address: z
    .object({
      street: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zip: z.string().nullable(),
    })
    .nullable(),
  phones: z.array(z.object({ number: z.string(), label: z.string().nullable() })),
  websites: z.array(z.string()),
  emails: z.array(z.string()),
  merchantId: z.string().nullable(),
});
export type StoreEvidence = z.infer<typeof StoreEvidence>;

export const TaxLine = z.object({
  label: z.string().nullable(),
  rate: z.string().nullable(),
  amountCents: z.number().int(),
});
export type TaxLine = z.infer<typeof TaxLine>;

export const Payment = z.object({
  method: z.string().nullable(),
  cardBrand: z.string().nullable(),
  cardType: z.enum(["credit", "debit"]).nullable(),
  /** Only ever the last four digits (SPEC.md §5). */
  last4: z.string().nullable(),
  amountCents: z.number().int().nullable(),
  approvalCode: z.string().nullable(),
});
export type Payment = z.infer<typeof Payment>;

export const TransactionNumber = z.object({ label: z.string().nullable(), value: z.string() });
export type TransactionNumber = z.infer<typeof TransactionNumber>;

/** Units a line's quantity may be in (SPEC.md §5, `line_items.unit`). */
export const LineUnit = z.enum(["each", "lb", "oz", "kg", "g", "gal", "l", "ml", "fl_oz"]);
export type LineUnit = z.infer<typeof LineUnit>;
