import type { Id } from "@snaptrack/core";
import type { ReceiptSource, ReceiptStatus } from "@snaptrack/contracts";

export interface Receipt {
  readonly id: Id;
  /** From the signed-in session, never from the request (SPEC.md §5). */
  readonly loggedByUserId: Id;
  readonly source: ReceiptSource;
  readonly status: ReceiptStatus;
  /** ISO 8601 UTC, so text order is time order. */
  readonly capturedAt: string;
}

export interface ReceiptImage {
  readonly id: Id;
  readonly receiptId: Id;
  /** Order on the receipt, top first, from 0. */
  readonly position: number;
  /** FileStore key; null once deleted under the retention rules (SPEC.md §6.8). */
  readonly imageKey: string | null;
  readonly thumbnailKey: string | null;
  readonly imageSha256: string;
}

export interface ReceiptWithImages {
  readonly receipt: Receipt;
  /** In position order. */
  readonly images: readonly ReceiptImage[];
}
