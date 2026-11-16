import type { ReceiptSource, ReceiptStatus, StoreMatch, StoreMatchedBy } from "@snaptrack/contracts";
import type { Cents, Id } from "@snaptrack/core";
import type { LineItem, ReceiptData } from "./extracted-data.ts";

/** A receipt as it is first saved. */
export interface NewReceipt {
  readonly id: Id;
  /** From the signed-in session, never from the request (SPEC.md §5). */
  readonly loggedByUserId: Id;
  readonly source: ReceiptSource;
  readonly status: ReceiptStatus;
  /** ISO 8601 UTC, so text order is time order. */
  readonly capturedAt: string;
}

/** What lists show for a receipt. */
export interface Receipt extends NewReceipt {
  /** Local date as printed (`YYYY-MM-DD`), with `THH:MM` when printed. */
  readonly purchasedAt: string | null;
  /** Null until extraction, or if no total was printed or read. */
  readonly totalCents: Cents | null;
  /** The sum of the line totals that are known; null when none is. */
  readonly linesTotalCents: Cents | null;
  readonly discountCents: Cents | null;
  readonly taxCents: Cents | null;
  readonly tipCents: Cents | null;
  /** A `stores` id; null until identified or chosen. */
  readonly storeId: Id | null;
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

export interface StoredLine extends LineItem {
  readonly id: Id;
  /** Null until matched or chosen (SPEC.md §6.4 step 2). */
  readonly itemId: Id | null;
}

/** Everything stored about one receipt. */
export interface ReceiptRecord extends ReceiptWithImages {
  readonly data: ReceiptData;
  /** In position order. */
  readonly lines: readonly StoredLine[];
  readonly storeMatchedBy: StoreMatchedBy | null;
  readonly storeMatch: StoreMatch | null;
  readonly note: string | null;
  readonly confirmedByUserId: Id | null;
  readonly confirmedAt: string | null;
  /** When it was uploaded. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Statuses extraction may move a receipt between; it never touches one a person has handled. */
export const EXTRACTION_STATUSES = ["uploaded", "extracting"] as const;
