import type { ReceiptSummary } from "@snaptrack/contracts";
import { Camera, RotateCw } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../shared/ui/Button.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import { CAPTURE_PATH } from "../capture/CaptureProvider.tsx";
import type { QueueEntry } from "../sync/upload-queue.ts";
import { useUploader } from "../sync/uploader-context.ts";
import { DigitalReceipt } from "./DigitalReceipt.tsx";
import { dayBlock, formatTotal } from "./receipt-format.ts";
import styles from "./ReceiptsScreen.module.css";
import { StatusIcon } from "./StatusIcon.tsx";
import { useReceiptCounts, useReceiptList, type ReviewFilter } from "./use-receipts.ts";

/**
 * Every transaction, newest first (SPEC.md §6.5). Each row is a collapsed digital receipt: a
 * confirmed one expands in place; any other opens its receipt page. The only filter is review
 * status, so the list doubles as a to-do list; everything else is filtered in Analytics.
 */
export function ReceiptsScreen() {
  const [filter, setFilter] = useState<ReviewFilter>(undefined);
  const list = useReceiptList(filter);
  const counts = useReceiptCounts();
  const { entries } = useUploader();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const receipts = list.data?.pages.flatMap((page) => page.receipts) ?? [];

  const chips: { value: ReviewFilter; label: string }[] = [
    { value: undefined, label: "All" },
    { value: "unreviewed", label: withCount("Unreviewed", counts.data?.unreviewed) },
    { value: "review_required", label: withCount("Review required", counts.data?.reviewRequired) },
  ];

  return (
    <div className={styles.screen}>
      <h1>Receipts</h1>

      <div role="group" aria-label="Show" className={styles.chips}>
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={styles.chip}
            aria-pressed={filter === chip.value}
            onClick={() => {
              setFilter(chip.value);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {entries.length > 0 && filter === undefined && (
        <section aria-label="Not uploaded yet">
          <p className={styles.eyebrow}>Not uploaded yet</p>
          <ul className={styles.list}>
            {entries.map((entry) => (
              <PendingRow key={entry.receipt.id} entry={entry} />
            ))}
          </ul>
        </section>
      )}

      {list.isPending ? (
        <Loader label="Loading receipts…" />
      ) : list.isError ? (
        <EmptyState
          title="Can't load receipts"
          action={
            <Button
              variant="secondary"
              busy={list.isFetching}
              onClick={() => {
                void list.refetch();
              }}
            >
              <RotateCw size={18} aria-hidden /> Try again
            </Button>
          }
        >
          Check your connection, then try again.
        </EmptyState>
      ) : receipts.length === 0 && filter !== undefined ? (
        <EmptyState title="Nothing waiting">
          {filter === "unreviewed"
            ? "No receipts are waiting for review."
            : "No receipts need to be typed in."}
        </EmptyState>
      ) : receipts.length === 0 && entries.length === 0 ? (
        <EmptyState
          title="No receipts yet"
          action={
            <Button
              onClick={() => {
                void navigate(CAPTURE_PATH);
              }}
            >
              <Camera size={18} aria-hidden /> Snap receipt
            </Button>
          }
        >
          Photograph a receipt, or upload one, and it shows up here.
        </EmptyState>
      ) : (
        <>
          <ol className={styles.list} aria-label="Receipts">
            {receipts.map((receipt) => (
              <Row
                key={receipt.id}
                receipt={receipt}
                expanded={open === receipt.id}
                onToggle={() => {
                  setOpen((current) => (current === receipt.id ? null : receipt.id));
                }}
              />
            ))}
          </ol>
          {list.hasNextPage && (
            <Button
              variant="secondary"
              busy={list.isFetchingNextPage}
              onClick={() => {
                void list.fetchNextPage();
              }}
            >
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}

const withCount = (label: string, n: number | undefined) =>
  n === undefined || n === 0 ? label : `${label} · ${n}`;

function storeName(receipt: ReceiptSummary): { text: string; known: boolean } {
  if (receipt.store !== null) return { text: receipt.store.name, known: true };
  const reading = receipt.status === "uploaded" || receipt.status === "extracting";
  return { text: reading ? "Reading receipt…" : "Unknown store", known: false };
}

function Row({
  receipt,
  expanded,
  onToggle,
}: {
  receipt: ReceiptSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const day = dayBlock(receipt.purchasedAt, receipt.capturedAt);
  const store = storeName(receipt);
  const reading = receipt.status === "uploaded" || receipt.status === "extracting";
  const content = (
    <>
      <span className={styles.day} aria-label={day.label}>
        <span className={styles.month} aria-hidden>
          {day.month}
        </span>
        <span className={styles.date} aria-hidden>
          {day.day}
        </span>
      </span>
      <span className={store.known ? styles.store : `${styles.store} ${styles.unknown}`}>{store.text}</span>
      <span className={styles.end}>
        {!reading && <span className={styles.amount}>{formatTotal(receipt.totalCents)}</span>}
        <StatusIcon status={receipt.status} />
      </span>
    </>
  );

  if (receipt.status !== "confirmed") {
    return (
      <li>
        <Link to={`/receipts/${receipt.id}`} className={`${styles.row} ${styles.link}`}>
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li className={styles.card}>
      <button type="button" className={styles.row} aria-expanded={expanded} onClick={onToggle}>
        {content}
      </button>
      {expanded && <DigitalReceipt id={receipt.id} />}
    </li>
  );
}

const PENDING_LABEL: Record<QueueEntry["state"], string> = {
  waiting: "Waiting to upload",
  uploading: "Uploading…",
  failed: "Upload failed",
  rejected: "Not saved",
};

function PendingRow({ entry }: { entry: QueueEntry }) {
  const { retry } = useUploader();
  const day = dayBlock(null, entry.receipt.capturedAt);
  return (
    <li className={`${styles.row} ${styles.card}`}>
      <span className={styles.day} aria-label={day.label}>
        <span className={styles.month} aria-hidden>
          {day.month}
        </span>
        <span className={styles.date} aria-hidden>
          {day.day}
        </span>
      </span>
      <span className={`${styles.store} ${styles.unknown}`}>{PENDING_LABEL[entry.state]}</span>
      {entry.state === "failed" && (
        <Button
          variant="secondary"
          onClick={() => {
            retry(entry.receipt.id);
          }}
        >
          <RotateCw size={18} aria-hidden /> Try again
        </Button>
      )}
    </li>
  );
}
