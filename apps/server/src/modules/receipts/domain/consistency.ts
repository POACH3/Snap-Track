import type { ConsistencyWarning } from "@snaptrack/contracts";
import type { Cents } from "@snaptrack/core";
import type { LineItem, ReceiptData } from "./extracted-data.ts";

/** A figure that doesn't add up, shown to the reviewer (SPEC.md §6.3 step 4). Warnings, never failures. */
export type { ConsistencyWarning };

/** "≈" allows 2 cents per figure added up, for rounding on the receipt. */
const TOLERANCE_PER_FIGURE = 2;
/** Older than this before the upload counts as unreasonably old. */
const MAX_AGE_YEARS = 2;

const sum = (values: readonly Cents[]) => values.reduce((a, b) => a + b, 0);
const known = <T>(values: readonly (T | null)[]): T[] => values.filter((v): v is T => v !== null);
const close = (expected: Cents, printed: Cents, figures: number) =>
  Math.abs(expected - printed) <= TOLERANCE_PER_FIGURE * Math.max(1, figures);

/**
 * Every check from SPEC.md §6.3 step 4 that the receipt has the figures for. A check whose
 * figures weren't printed or read is skipped, not failed.
 */
export function checkConsistency(
  data: ReceiptData,
  lines: readonly LineItem[],
  uploadedAt: Date,
): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = [];
  const lineTotals = known(lines.map((line) => line.lineTotalCents));
  const itemTotals = known(lines.filter((line) => line.kind === "item").map((line) => line.lineTotalCents));
  const feeTotals = known(lines.filter((line) => line.kind === "fee").map((line) => line.lineTotalCents));

  // Some receipts print the subtotal before their fees and add them after it (a core charge,
  // then FINAL SUBTOTAL; bottle deposits; service charges). The model reports the subtotal as
  // printed, so a subtotal that matches the items alone is right, with the fees added later on.
  const feesOutsideSubtotal =
    data.subtotalCents !== null &&
    feeTotals.length > 0 &&
    !close(sum(lineTotals), data.subtotalCents, lineTotals.length) &&
    close(sum(itemTotals), data.subtotalCents, itemTotals.length);

  if (data.subtotalCents !== null && lineTotals.length > 0 && !feesOutsideSubtotal) {
    const expected = sum(lineTotals);
    if (!close(expected, data.subtotalCents, lineTotals.length)) {
      warnings.push({ kind: "lines-vs-subtotal", expectedCents: expected, printedCents: data.subtotalCents });
    }
  }

  if (data.subtotalCents !== null && data.totalCents !== null) {
    const fees = feesOutsideSubtotal ? sum(feeTotals) : 0;
    const expected =
      data.subtotalCents - (data.discountCents ?? 0) + fees + (data.taxCents ?? 0) + (data.tipCents ?? 0);
    if (!close(expected, data.totalCents, 4 + (feesOutsideSubtotal ? feeTotals.length : 0))) {
      warnings.push({ kind: "subtotal-vs-total", expectedCents: expected, printedCents: data.totalCents });
    }
  }

  if (data.taxCents !== null && data.taxLines.length > 0) {
    const expected = sum(data.taxLines.map((t) => t.amountCents));
    if (!close(expected, data.taxCents, data.taxLines.length)) {
      warnings.push({ kind: "tax-lines-vs-tax", expectedCents: expected, printedCents: data.taxCents });
    }
  }

  const paid = known(data.payments.map((p) => p.amountCents));
  if (data.totalCents !== null && paid.length > 0) {
    const expected = sum(paid);
    if (!close(expected, data.totalCents, paid.length)) {
      warnings.push({ kind: "payments-vs-total", expectedCents: expected, printedCents: data.totalCents });
    }
  }

  if (data.printedSavingsCents !== null) {
    const discounts = [...known(lines.map((line) => line.discountCents)), ...known([data.discountCents])];
    const expected = sum(discounts);
    if (!close(expected, data.printedSavingsCents, discounts.length)) {
      warnings.push({
        kind: "discounts-vs-savings",
        expectedCents: expected,
        printedCents: data.printedSavingsCents,
      });
    }
  }

  if (data.printedItemCount !== null) {
    const items = lines.filter((line) => line.kind === "item");
    // Receipts count either lines or pieces; either matching is fine.
    const pieces = items.reduce((n, line) => n + (line.unit === "each" ? line.quantityMilli / 1000 : 1), 0);
    if (items.length !== data.printedItemCount && pieces !== data.printedItemCount) {
      warnings.push({ kind: "item-count", counted: items.length, printed: data.printedItemCount });
    }
  }

  for (const line of lines) {
    if (line.unitPriceCents === null || line.lineTotalCents === null) continue;
    const expected = Math.round((line.quantityMilli * line.unitPriceCents) / 1000);
    const printed = line.lineTotalCents + (line.discountCents ?? 0);
    if (!close(expected, printed, 1)) {
      warnings.push({
        kind: "line-price",
        position: line.position,
        expectedCents: expected,
        printedCents: printed,
      });
    }
  }

  if (data.purchasedAt !== null) {
    const day = data.purchasedAt.slice(0, 10);
    // A day of slack for time zones: the printed date is local, the upload time is UTC.
    const latest = new Date(uploadedAt.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const earliest = new Date(uploadedAt);
    earliest.setUTCFullYear(earliest.getUTCFullYear() - MAX_AGE_YEARS);
    if (day > latest) warnings.push({ kind: "date-in-future", purchasedAt: data.purchasedAt });
    else if (day < earliest.toISOString().slice(0, 10))
      warnings.push({ kind: "date-too-old", purchasedAt: data.purchasedAt });
  }

  return warnings;
}
