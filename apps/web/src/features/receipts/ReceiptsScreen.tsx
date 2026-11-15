import { receiptThumbnailPath } from "@snaptrack/contracts";
import { Camera, ImageOff, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../shared/ui/Button.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import { Pill } from "../../shared/ui/Pill.tsx";
import { CAPTURE_PATH } from "../capture/CaptureProvider.tsx";
import type { QueueEntry } from "../sync/upload-queue.ts";
import { useUploader } from "../sync/uploader-context.ts";
import { STATUS_LABEL, formatCapturedAt, photoCount } from "./receipt-format.ts";
import styles from "./ReceiptsScreen.module.css";
import { useReceiptList } from "./use-receipts.ts";

export function ReceiptsScreen() {
  const list = useReceiptList();
  const { entries } = useUploader();
  const navigate = useNavigate();
  const receipts = list.data?.pages.flatMap((page) => page.receipts) ?? [];

  return (
    <div className={styles.screen}>
      <h1>Receipts</h1>
      {entries.length > 0 && (
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
          <ul className={styles.list} aria-label="Receipts">
            {receipts.map((receipt) => {
              const status = STATUS_LABEL[receipt.status];
              const first = receipt.images[0];
              return (
                <li key={receipt.id}>
                  <Link to={`/receipts/${receipt.id}`} className={`${styles.row} ${styles.link}`}>
                    {first === undefined ? (
                      <span className={styles.thumb}>
                        <ImageOff size={18} aria-hidden />
                      </span>
                    ) : (
                      <img
                        className={styles.thumb}
                        src={receiptThumbnailPath(first.id)}
                        alt=""
                        loading="lazy"
                      />
                    )}
                    <span className={styles.details}>
                      <span className={styles.title}>{formatCapturedAt(receipt.capturedAt)}</span>
                      <span className={styles.meta}>
                        {receipt.loggedBy.displayName} · {photoCount(receipt.images.length)}
                      </span>
                    </span>
                    <Pill variant={status.variant}>{status.label}</Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
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

const PENDING_LABEL: Record<QueueEntry["state"], { label: string; variant: "plain" | "warning" }> = {
  waiting: { label: "Waiting", variant: "plain" },
  uploading: { label: "Uploading", variant: "plain" },
  failed: { label: "Upload failed", variant: "warning" },
  rejected: { label: "Not saved", variant: "warning" },
};

function PendingRow({ entry }: { entry: QueueEntry }) {
  const { retry } = useUploader();
  const first = entry.receipt.images[0];
  const state = PENDING_LABEL[entry.state];

  return (
    <li className={styles.row}>
      {first === undefined ? <span className={styles.thumb} /> : <BlobThumb blob={first} />}
      <span className={styles.details}>
        <span className={styles.title}>{formatCapturedAt(entry.receipt.capturedAt)}</span>
        <span className={styles.meta}>{photoCount(entry.receipt.images.length)}</span>
      </span>
      {entry.state === "failed" ? (
        <Button
          variant="secondary"
          onClick={() => {
            retry(entry.receipt.id);
          }}
        >
          <RotateCw size={18} aria-hidden /> Try again
        </Button>
      ) : (
        <Pill variant={state.variant}>{state.label}</Pill>
      )}
    </li>
  );
}

/** A photo still on the device. Its object URL lives exactly as long as the effect. */
function BlobThumb({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (ref.current !== null) ref.current.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <img
      ref={ref}
      className={styles.thumb}
      alt=""
      // A photo the browser can't show (e.g. HEIC in Chrome) leaves the plain tile.
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
