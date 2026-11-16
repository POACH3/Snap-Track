import type { DuplicateMatch } from "@snaptrack/contracts";
import { Trash2, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { formatTotal, shortDate } from "./receipt-format.ts";
import styles from "./DuplicateWarnings.module.css";

/** Which other receipt it is, in words: "the Fresh Mart receipt from Nov 13, $7.00, logged by Sam". */
function otherText(match: DuplicateMatch): string {
  const r = match.receipt;
  const store = r.store?.name ?? "unknown store's";
  const kind = r.source === "manual" ? "entry" : "receipt";
  return `the ${store} ${kind} from ${shortDate(r.purchasedAt, r.capturedAt)}, ${formatTotal(r.totalCents)}, logged by ${r.loggedBy.displayName}`;
}

function bodyText(match: DuplicateMatch): string {
  switch (match.reason) {
    case "transaction_number":
      return `Same transaction number (${match.detail ?? ""}) as ${otherText(match)}.`;
    case "approval_code":
      return `Same card approval code (${match.detail ?? ""}) as ${otherText(match)}.`;
    case "same_photo":
      return `The same photo as ${otherText(match)}.`;
    case "same_details":
      return `Same store, date, time and total as ${otherText(match)}.`;
  }
}

/**
 * The duplicate warning (docs/DESIGN.md, "Duplicate warning"): an amber box per other receipt,
 * linking to it. On a saved receipt it offers **Delete this receipt** and **Not a duplicate**;
 * on a manual entry still being typed, only the warning.
 */
export function DuplicateWarnings({
  duplicates,
  onDelete,
  onDismiss,
  busy = false,
}: {
  duplicates: readonly DuplicateMatch[];
  onDelete?: (() => void) | undefined;
  onDismiss?: ((otherId: string) => void) | undefined;
  busy?: boolean;
}) {
  if (duplicates.length === 0) return null;
  return (
    <div className={styles.list}>
      {duplicates.map((match) => (
        <div key={match.receipt.id} role="alert" className={styles.warning}>
          <div className={styles.text}>
            <TriangleAlert size={16} aria-hidden className={styles.icon} />
            <div>
              <p className={styles.title}>
                {match.kind === "definite" ? "This receipt is already here" : "This may be a duplicate"}
              </p>
              <p className={styles.body}>{bodyText(match)}</p>
              <Link to={`/receipts/${match.receipt.id}`} className={styles.link}>
                Open that receipt
              </Link>
            </div>
          </div>
          {(onDelete !== undefined || onDismiss !== undefined) && (
            <div className={styles.actions}>
              {onDelete !== undefined && (
                <button type="button" className={styles.delete} disabled={busy} onClick={onDelete}>
                  <Trash2 size={16} aria-hidden /> Delete this receipt
                </button>
              )}
              {onDismiss !== undefined && (
                <button
                  type="button"
                  className={styles.dismiss}
                  disabled={busy}
                  onClick={() => {
                    onDismiss(match.receipt.id);
                  }}
                >
                  Not a duplicate
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
