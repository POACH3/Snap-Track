import type { Payment, ReceiptStatus } from "@snaptrack/contracts";
import { formatUsd } from "@snaptrack/core";

/** How each status is named (screen readers, the receipt page). The list shows an icon (docs/DESIGN.md, "Receipt status"). */
export const STATUS_LABEL: Record<ReceiptStatus, string> = {
  uploaded: "Being read",
  extracting: "Being read",
  unreviewed: "Unreviewed",
  review_required: "Review required",
  confirmed: "Confirmed",
};

/** A local date as printed (`YYYY-MM-DD`, optional `THH:MM`), or a capture time (ISO, UTC), as a Date. */
function toDate(purchasedAt: string | null, capturedAt: string): { date: Date; hasTime: boolean } {
  const match = purchasedAt?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (match === null || match === undefined) return { date: new Date(capturedAt), hasTime: true };
  // A time wasn't printed when its groups are missing; Number(undefined) would be NaN.
  const part = (index: number) => Number(match[index] ?? "0");
  return {
    date: new Date(part(1), part(2) - 1, part(3), part(4), part(5)),
    hasTime: match[4] !== undefined,
  };
}

const month = new Intl.DateTimeFormat(undefined, { month: "short" });
const long = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const short = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** The list's date block: "NOV" over "14". The purchase date when known, else when the photo was taken. */
export function dayBlock(
  purchasedAt: string | null,
  capturedAt: string,
): { month: string; day: string; label: string } {
  const { date } = toDate(purchasedAt, capturedAt);
  return {
    month: month.format(date).toUpperCase(),
    day: String(date.getDate()).padStart(2, "0"),
    label: long.format(date),
  };
}

/** "Fri, Nov 14, 2026 · 5:42 PM", without the time when none was printed. */
export function purchaseText(purchasedAt: string | null, capturedAt: string): string {
  const { date, hasTime } = toDate(purchasedAt, capturedAt);
  return hasTime ? `${long.format(date)} · ${clock.format(date)}` : long.format(date);
}

/** "Nov 13" for a page heading's small print. */
export const shortDate = (purchasedAt: string | null, capturedAt: string) =>
  short.format(toDate(purchasedAt, capturedAt).date);

/** The amount, or a dash while there is none yet (not read, or not printed). */
export const formatTotal = (cents: number | null) => (cents === null ? "—" : formatUsd(cents));

/** "Visa credit ···· 4821", "Cash", or whatever of it was printed. */
export function paymentText(payment: Payment): string {
  const card = [payment.cardBrand, payment.cardType].filter((part) => part !== null).join(" ");
  const last4 = payment.last4 === null ? "" : ` ···· ${payment.last4}`;
  const name = card !== "" ? card : (payment.method ?? "Payment");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}${last4}`;
}
