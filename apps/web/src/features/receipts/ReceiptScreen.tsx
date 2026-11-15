import { isDefinedError } from "@orpc/client";
import { receiptImagePath } from "@snaptrack/contracts";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import { Pill } from "../../shared/ui/Pill.tsx";
import { STATUS_LABEL, formatCapturedAt, photoCount } from "./receipt-format.ts";
import styles from "./ReceiptScreen.module.css";
import { useReceipt } from "./use-receipts.ts";

/** One receipt and all its photos, in order (SPEC.md F5). */
export function ReceiptScreen() {
  const { id = "" } = useParams();
  const query = useReceipt(id);

  const back = (
    <Link to="/" className={styles.back}>
      <ArrowLeft size={18} aria-hidden /> Receipts
    </Link>
  );

  if (query.isPending) return <Loader label="Loading receipt…" />;
  if (query.isError) {
    const missing = isDefinedError(query.error); // RECEIPT_NOT_FOUND is its only defined error
    return (
      <div className={styles.screen}>
        {back}
        <EmptyState title={missing ? "No such receipt" : "Can't load this receipt"}>
          {missing ? "It may have been removed." : "Check your connection, then try again."}
        </EmptyState>
      </div>
    );
  }

  const { receipt } = query.data;
  const status = STATUS_LABEL[receipt.status];
  return (
    <div className={styles.screen}>
      {back}
      <header className={styles.header}>
        <h1 className={styles.title}>{formatCapturedAt(receipt.capturedAt)}</h1>
        <p className={styles.meta}>
          Logged by {receipt.loggedBy.displayName} · {photoCount(receipt.images.length)}
        </p>
        <Pill variant={status.variant}>{status.label}</Pill>
      </header>
      <ol className={styles.images} aria-label="Photos of this receipt">
        {receipt.images.map((image) => (
          <li key={image.id}>
            <img
              className={styles.image}
              src={receiptImagePath(image.id)}
              alt={`Photo ${image.position + 1} of ${receipt.images.length}`}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
