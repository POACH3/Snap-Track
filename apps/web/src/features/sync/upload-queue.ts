/** A receipt waiting to upload: everything captured, in order (SPEC.md §6.1 step 3). */
export interface QueuedReceipt {
  /** Made on the device at capture time, so a retried upload is the same receipt. */
  id: string;
  capturedAt: string;
  /** Photos in order, top of the receipt first. */
  images: Blob[];
}

/** failed: can be tried again (e.g. no connection). rejected: the server refused it; it can only be removed. */
export type UploadState = "waiting" | "uploading" | "failed" | "rejected";

export interface QueueEntry {
  receipt: QueuedReceipt;
  state: UploadState;
}

/**
 * Receipts captured but not yet confirmed by the server (SPEC.md §4.2). An entry is removed only
 * after the server confirms it has every image (§6.2). In Stage 2 the queue is in memory, so it
 * is lost if the app closes; Stage 5 adds the IndexedDB adapter behind this same interface.
 */
export interface UploadQueue {
  add(receipt: QueuedReceipt): void;
  setState(id: string, state: UploadState): void;
  remove(id: string): void;
  /** Oldest first. The same array until something changes, for `useSyncExternalStore`. */
  entries(): readonly QueueEntry[];
  /** Calls `listener` after every change; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}
