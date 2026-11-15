import type { ReceiptStatus } from "@snaptrack/contracts";
import { formatUsd } from "@snaptrack/core";

/** How each status is shown (docs/DESIGN.md, "Components": pills; warning for review required). */
export const STATUS_LABEL: Record<ReceiptStatus, { label: string; variant: "plain" | "accent" | "warning" }> =
  {
    uploaded: { label: "Uploaded", variant: "plain" },
    extracting: { label: "Reading", variant: "plain" },
    unreviewed: { label: "Unreviewed", variant: "plain" },
    review_required: { label: "Review required", variant: "warning" },
    confirmed: { label: "Confirmed", variant: "accent" },
  };

const thisYear = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const otherYear = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** "Nov 15, 12:33 PM" this year; "Nov 15, 2025" for earlier years, where the time matters less. */
export function formatCapturedAt(iso: string): string {
  const date = new Date(iso);
  return (date.getFullYear() === new Date().getFullYear() ? thisYear : otherYear).format(date);
}

export const photoCount = (n: number) => (n === 1 ? "1 photo" : `${n} photos`);

/** The total, or a dash while there is none yet (not read, or not printed). */
export const formatTotal = (cents: number | null) => (cents === null ? "—" : formatUsd(cents));
