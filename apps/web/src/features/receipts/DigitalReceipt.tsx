import { formatUsd } from "@snaptrack/core";
import { Image } from "lucide-react";
import { Link } from "react-router";
import { Loader } from "../../shared/ui/Loader.tsx";
import { formatTotal, paymentText, purchaseText } from "./receipt-format.ts";
import styles from "./DigitalReceipt.module.css";
import { useReceipt } from "./use-receipts.ts";

/**
 * A confirmed receipt as a short summary, not a copy of the paper one (SPEC.md §6.5): store,
 * date, each line with its price, the totals, how it was paid, and a link to the photos.
 */
export function DigitalReceipt({ id }: { id: string }) {
  const query = useReceipt(id);
  if (query.isPending) return <Loader label="Loading receipt…" />;
  if (query.isError) return <p className={styles.muted}>Can't load this receipt. Check your connection.</p>;

  const { receipt } = query.data;
  const { draft } = receipt;
  const optional = (label: string, cents: number | null, sign = "") =>
    cents === null || cents === 0 ? null : (
      <>
        <dt>{label}</dt>
        <dd>
          {sign}
          {formatUsd(cents)}
        </dd>
      </>
    );

  return (
    <div className={styles.receipt}>
      <p className={styles.meta}>
        <span>{receipt.store?.name ?? "Unknown store"}</span>
        <span>{purchaseText(receipt.purchasedAt, receipt.capturedAt)}</span>
      </p>

      {draft.lines.length > 0 && (
        <ul className={styles.lines} aria-label="Items">
          {draft.lines.map((line) => (
            <li key={line.id}>
              <span className={styles.name}>
                {line.itemRef?.name ?? line.rawName ?? (line.kind === "fee" ? "Fee" : "Item")}
              </span>
              <span className={styles.price}>{formatTotal(line.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
      )}

      <dl className={styles.totals}>
        {draft.subtotalCents !== null && (
          <>
            <dt>Subtotal</dt>
            <dd>{formatUsd(draft.subtotalCents)}</dd>
          </>
        )}
        {optional("Receipt discount", draft.discountCents, "−")}
        {draft.taxCents !== null && (
          <>
            <dt>Tax</dt>
            <dd>{formatUsd(draft.taxCents)}</dd>
          </>
        )}
        {optional("Tip", draft.tipCents)}
        <dt className={styles.total}>Total</dt>
        <dd className={styles.total}>{formatTotal(receipt.totalCents)}</dd>
      </dl>

      {draft.payments.length > 0 && (
        <dl className={styles.paid}>
          <dt>Paid with</dt>
          <dd>{draft.payments.map(paymentText).join(", ")}</dd>
        </dl>
      )}

      <Link to={`/receipts/${id}`} className={styles.image}>
        <Image size={16} aria-hidden />
        {receipt.images.length > 0 ? "View receipt image" : "View details"}
      </Link>
    </div>
  );
}
