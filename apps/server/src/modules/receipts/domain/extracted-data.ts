import type {
  ExtractedLine,
  ExtractedReceipt,
  LineUnit,
  Payment,
  StoreEvidence,
  TaxLine,
  TransactionNumber,
} from "@snaptrack/contracts";
import { ONE, dollarsToCents, toMilli, type Cents, type Milli } from "@snaptrack/core";

/** A receipt's extracted figures, as stored on `receipts` (SPEC.md §5). */
export interface ReceiptData {
  /** Local date as printed (`YYYY-MM-DD`), with the time (`THH:MM`) when printed. */
  purchasedAt: string | null;
  subtotalCents: Cents | null;
  discountCents: Cents | null;
  taxCents: Cents | null;
  tipCents: Cents | null;
  totalCents: Cents | null;
  printedSavingsCents: Cents | null;
  printedItemCount: number | null;
  taxLines: TaxLine[];
  payments: Payment[];
  transactionNumbers: TransactionNumber[];
  rawText: string | null;
  storeEvidence: StoreEvidence;
}

export interface LineItem {
  /** Order on the receipt, from 0. */
  position: number;
  kind: "item" | "fee";
  rawName: string | null;
  itemCode: string | null;
  quantityMilli: Milli;
  unit: LineUnit;
  unitPriceCents: Cents | null;
  /** The amount actually charged, after any item discount. */
  lineTotalCents: Cents | null;
  /** Savings on this line, already included in the line total. */
  discountCents: Cents | null;
  taxCode: string | null;
  suggestedItemName: string | null;
}

export interface ExtractionResult {
  data: ReceiptData;
  lines: LineItem[];
}

// Ways receipts print units, mapped to SPEC.md §5's list.
const UNITS: Record<string, LineUnit> = {
  each: "each",
  ea: "each",
  pc: "each",
  pcs: "each",
  ct: "each",
  unit: "each",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  kg: "kg",
  g: "g",
  gram: "g",
  grams: "g",
  gal: "gal",
  gallon: "gal",
  l: "l",
  liter: "l",
  litre: "l",
  ml: "ml",
  "fl oz": "fl_oz",
  fl_oz: "fl_oz",
  floz: "fl_oz",
};

/** A printed unit as one of §5's units; anything unknown counts as `each` (the printed text stays in `raw_text`). */
export function normalizeUnit(unit: string | null | undefined): LineUnit {
  return UNITS[(unit ?? "").trim().toLowerCase().replace(/\.$/, "")] ?? "each";
}

const cents = (amount: number | null | undefined): Cents | null =>
  amount === null || amount === undefined ? null : dollarsToCents(amount);
const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? null : trimmed;
};

/** `YYYY-MM-DD`, plus `THH:MM` when a valid time was printed; null if the date isn't a real one. */
export function purchasedAt(date: string | null | undefined, time: string | null | undefined): string | null {
  const day = clean(date);
  if (day === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  const clock = clean(time)?.match(/^(\d{1,2}):(\d{2})/);
  if (!clock) return day;
  const [hours, minutes] = [Number(clock[1]), Number(clock[2])];
  if (hours > 23 || minutes > 59) return day;
  return `${day}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Only ever the last four digits of a card (SPEC.md §5); further digits stay in `raw_text` only. */
export function lastFour(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function toLine(line: ExtractedLine, position: number): LineItem {
  return {
    position,
    kind: line.kind ?? "item",
    rawName: clean(line.printedName),
    itemCode: clean(line.itemCode),
    quantityMilli:
      line.quantity === null || line.quantity === undefined || line.quantity <= 0
        ? ONE
        : toMilli(line.quantity),
    unit: normalizeUnit(line.unit),
    unitPriceCents: cents(line.unitPrice),
    lineTotalCents: cents(line.amount),
    discountCents: cents(
      line.discount === null || line.discount === undefined ? null : Math.abs(line.discount),
    ),
    taxCode: clean(line.taxCode),
    suggestedItemName: clean(line.suggestedName),
  };
}

/** The model's reply as stored rows. Lines with neither a name nor an amount are dropped as noise. */
export function fromExtraction(extracted: ExtractedReceipt): ExtractionResult {
  const store = extracted.store;
  const lines = extracted.lines
    .filter((line) => clean(line.printedName) !== null || (line.amount !== null && line.amount !== undefined))
    .map(toLine);
  return {
    data: {
      purchasedAt: purchasedAt(extracted.purchaseDate, extracted.purchaseTime),
      subtotalCents: cents(extracted.subtotal),
      discountCents: cents(
        extracted.receiptDiscount === null || extracted.receiptDiscount === undefined
          ? null
          : Math.abs(extracted.receiptDiscount),
      ),
      taxCents: cents(extracted.tax),
      tipCents: cents(extracted.tip),
      totalCents: cents(extracted.total),
      printedSavingsCents: cents(extracted.printedSavings),
      printedItemCount:
        extracted.printedItemCount === null || extracted.printedItemCount === undefined
          ? null
          : Math.round(extracted.printedItemCount),
      taxLines: extracted.taxLines.map((t) => ({
        label: clean(t.label),
        rate: clean(t.rate),
        amountCents: dollarsToCents(t.amount),
      })),
      payments: extracted.payments.map((p) => ({
        method: clean(p.method),
        cardBrand: clean(p.cardBrand),
        cardType: p.cardType ?? null,
        last4: lastFour(p.last4),
        amountCents: cents(p.amount),
        approvalCode: clean(p.approvalCode),
      })),
      transactionNumbers: extracted.transactionNumbers.map((t) => ({
        label: clean(t.label),
        value: t.value.trim(),
      })),
      rawText: clean(extracted.rawText),
      storeEvidence: {
        logoText: clean(store?.logoText),
        brandGuess: clean(store?.brandGuess),
        printedName: clean(store?.printedName),
        legalName: clean(store?.legalName),
        branchName: clean(store?.branchName),
        storeNumber: clean(store?.storeNumber),
        address:
          store?.address === null || store?.address === undefined
            ? null
            : {
                street: clean(store.address.street),
                city: clean(store.address.city),
                state: clean(store.address.state),
                zip: clean(store.address.zip),
              },
        phones: (store?.phones ?? []).map((p) => ({ number: p.number.trim(), label: clean(p.label) })),
        websites: (store?.websites ?? []).map((w) => w.trim()),
        emails: (store?.emails ?? []).map((e) => e.trim()),
        merchantId: clean(store?.merchantId),
      },
    },
    lines,
  };
}

/**
 * Whether extraction found anything that counts as an amount: a total or any line amount
 * (SPEC.md §5 Rules). Without either, the receipt needs a person (`review_required`).
 */
export function hasUsableAmounts(result: ExtractionResult): boolean {
  return result.data.totalCents !== null || result.lines.some((line) => line.lineTotalCents !== null);
}
