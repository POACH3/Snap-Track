import type {
  DraftLine,
  ItemRef,
  LineCategory,
  LineItemSuggestion,
  ReceiptDetail,
  ReceiptDraft,
  StoreEvidence,
} from "@snaptrack/contracts";
import type { Cents, Id } from "@snaptrack/core";
import type { LineItem, ReceiptData } from "./extracted-data.ts";
import type { LineLabels, StoredLine } from "./receipt.ts";

/** A line as the review form saves it: an existing line keeps its id. */
export type ReviewedLine = Omit<LineItem, "suggestedItemName"> &
  LineLabels & {
    readonly id?: Id;
    /** Resolved before saving: a chosen item, a new one just created, or a match. */
    readonly itemId: Id | null;
  };

/** Store details as printed, when nothing was read. */
export const EMPTY_EVIDENCE: StoreEvidence = {
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
};

/**
 * A receipt's amount (SPEC.md §5 Rules): its total, or, when no total was read, its line totals
 * − receipt discount + tax + tip, with missing figures counted as zero. Null when neither a
 * total nor any line amount is known.
 */
export function receiptAmount(receipt: {
  totalCents: Cents | null;
  linesTotalCents: Cents | null;
  discountCents: Cents | null;
  taxCents: Cents | null;
  tipCents: Cents | null;
}): Cents | null {
  if (receipt.totalCents !== null) return receipt.totalCents;
  if (receipt.linesTotalCents === null) return null;
  return (
    receipt.linesTotalCents - (receipt.discountCents ?? 0) + (receipt.taxCents ?? 0) + (receipt.tipCents ?? 0)
  );
}

/** The form's figures as stored receipt data. The transcription isn't edited, so it is passed in. */
export function dataFromDraft(draft: ReceiptDraft, rawText: string | null): ReceiptData {
  return {
    purchasedAt: draft.purchasedAt,
    subtotalCents: draft.subtotalCents,
    discountCents: draft.discountCents,
    taxCents: draft.taxCents,
    tipCents: draft.tipCents,
    totalCents: draft.totalCents,
    printedSavingsCents: draft.printedSavingsCents,
    printedItemCount: draft.printedItemCount,
    taxLines: draft.taxLines,
    payments: draft.payments,
    transactionNumbers: draft.transactionNumbers,
    rawText,
    storeEvidence: draft.storeEvidence,
  };
}

/** The form's lines, numbered in the order the form lists them. */
export function linesFromDraft(lines: readonly DraftLine[]): ReviewedLine[] {
  return lines.map((line, position) => ({
    ...(line.id === undefined ? {} : { id: line.id }),
    itemId: line.item?.kind === "existing" ? line.item.itemId : null,
    position,
    kind: line.kind,
    rawName: line.rawName,
    itemCode: line.itemCode,
    quantityMilli: line.quantityMilli,
    unit: line.unit,
    unitPriceCents: line.unitPriceCents,
    lineTotalCents: line.lineTotalCents,
    discountCents: line.discountCents,
    taxCode: line.taxCode,
    lineCategoryId: line.categoryId,
    tagIds: [...new Set(line.tagIds)],
    suggestionOutcome: line.suggestionOutcome,
  }));
}

/** What the review form starts from, with each line's item and, for a line with none, what to offer. */
export function draftOf(
  data: ReceiptData,
  note: string | null,
  lines: readonly StoredLine[],
  items: ReadonlyMap<Id, ItemRef>,
  suggestions: ReadonlyMap<Id, LineItemSuggestion | null>,
  categories: ReadonlyMap<Id, LineCategory | null>,
): ReceiptDetail["draft"] {
  return {
    purchasedAt: data.purchasedAt,
    subtotalCents: data.subtotalCents,
    discountCents: data.discountCents,
    taxCents: data.taxCents,
    tipCents: data.tipCents,
    totalCents: data.totalCents,
    printedSavingsCents: data.printedSavingsCents,
    printedItemCount: data.printedItemCount,
    taxLines: data.taxLines,
    payments: data.payments,
    transactionNumbers: data.transactionNumbers,
    storeEvidence: data.storeEvidence,
    note,
    lines: lines.map((line) => ({
      id: line.id,
      item: line.itemId === null ? null : { kind: "existing" as const, itemId: line.itemId },
      itemRef: line.itemId === null ? null : (items.get(line.itemId) ?? null),
      itemSuggestion: line.itemId === null ? (suggestions.get(line.id) ?? null) : null,
      kind: line.kind,
      rawName: line.rawName,
      itemCode: line.itemCode,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
      discountCents: line.discountCents,
      taxCode: line.taxCode,
      suggestedItemName: line.suggestedItemName,
      categoryId: line.lineCategoryId,
      tagIds: [...line.tagIds],
      suggestionOutcome: line.suggestionOutcome,
      category: categories.get(line.id) ?? null,
      suggestedCategoryId: line.suggestedCategoryId,
      suggestedTagIds: [...line.suggestedTagIds],
    })),
  };
}

/** Lines as the consistency checks read them. */
export const asLineItems = (lines: readonly ReviewedLine[]): LineItem[] =>
  lines.map((line) => ({ ...line, suggestedItemName: null }));
