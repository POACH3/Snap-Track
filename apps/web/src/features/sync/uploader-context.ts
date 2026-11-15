import { createContext, useContext } from "react";
import type { QueueEntry, QueuedReceipt } from "./upload-queue.ts";

export interface Uploader {
  /** Receipts not yet saved by the server, oldest first. */
  entries: readonly QueueEntry[];
  /** Adds a captured receipt and starts uploading. */
  enqueue: (receipt: QueuedReceipt) => void;
  retry: (id: string) => void;
}

export const UploaderContext = createContext<Uploader | null>(null);

export function useUploader(): Uploader {
  const uploader = useContext(UploaderContext);
  if (uploader === null) throw new Error("useUploader needs an UploaderProvider above it");
  return uploader;
}
