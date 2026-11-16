import type {
  IdentifierAnswer,
  IdentifierQuestion,
  ItemNameSource,
  ItemRef,
  LearningNotice,
  LineItemSuggestion,
  LineUnit,
  ReceiptStatus,
  StoreEvidence,
  StoreIssue,
  StoreMatch,
  StoreMatchedBy,
  StoreRef,
  StoreSuggestion,
} from "@snaptrack/contracts";
import type { Id, PixelSize, Result } from "@snaptrack/core";
import type { ExtractionResult, ReceiptData } from "./domain/extracted-data.ts";
import type { ListPosition } from "./domain/list-cursor.ts";
import type {
  LineGuess,
  NewReceipt,
  ReceiptImage,
  ReceiptRecord,
  ReceiptWithImages,
} from "./domain/receipt.ts";
import type { ReviewedLine } from "./domain/review.ts";

/** The store a receipt is set to, and how. */
export interface ReceiptStore {
  storeId: Id;
  matchedBy: StoreMatchedBy;
  /** What made an automatic match; null otherwise. */
  match: StoreMatch | null;
}

/** A confirmed review, as saved. */
export interface Review {
  data: ReceiptData;
  lines: readonly ReviewedLine[];
  note: string | null;
  store: ReceiptStore;
  confirmedByUserId: Id;
}

/** Repositories are synchronous (SPEC.md §3.1 rule 7). */
export interface ReceiptRepository {
  findById(id: Id): ReceiptWithImages | undefined;
  /** Everything stored about a receipt, lines included. */
  findRecord(id: Id): ReceiptRecord | undefined;
  /** Saves a receipt and all its images. Returns false, saving nothing, if the id is taken. */
  insert(receipt: NewReceipt, images: readonly ReceiptImage[]): boolean;
  /** Newest first by capture time, then id; only receipts after `after`, and of `status`, when given. */
  list(options: {
    after: ListPosition | undefined;
    limit: number;
    status?: "unreviewed" | "review_required" | undefined;
  }): ReceiptWithImages[];
  findImage(imageId: Id): ReceiptImage | undefined;
  /** Changes the status only if it is now one of `from`. Returns whether it changed. */
  setStatus(id: Id, status: ReceiptStatus, from: readonly ReceiptStatus[]): boolean;
  /**
   * Replaces the extracted data and line items, and sets the status, the store it identified and
   * each line's matched item (`itemIds`, in line order).
   */
  saveExtraction(
    id: Id,
    result: ExtractionResult,
    status: ReceiptStatus,
    store: ReceiptStore | undefined,
    itemIds: readonly (Id | null)[],
    guesses: readonly LineGuess[],
  ): void;
  /**
   * Saves a review and marks the receipt confirmed. Lines with an id the receipt has are updated
   * in place (keeping what is attached to them), other lines are added, and lines left out are
   * removed.
   */
  saveReview(id: Id, review: Review): void;
  /** How many receipts have each status that is waiting for a person. */
  countWaiting(): { unreviewed: number; reviewRequired: number };
  /** Receipts not confirmed, with no store and some store evidence: the ones re-matching could fix. */
  listUnidentified(): { id: Id; evidence: StoreEvidence }[];
  /** Sets the store of a receipt that still has none and isn't confirmed. Returns whether it changed. */
  setIdentifiedStore(id: Id, store: ReceiptStore): boolean;
  /** Read receipts' lines with no item, grouped by receipt with its store: what item re-matching could fix. */
  listLinesWithoutItem(): {
    receiptId: Id;
    storeId: Id | null;
    lines: { id: Id; kind: "item" | "fee"; rawName: string | null; itemCode: string | null }[];
  }[];
  /** Sets a line's item if it still has none. Returns whether it changed. */
  setLineItem(lineId: Id, itemId: Id): boolean;
  /** An item's latest purchases, newest first. */
  itemPurchases(itemId: Id, limit: number): ItemPurchase[];
}

export interface ItemPurchase {
  receiptId: Id;
  purchasedAt: string | null;
  capturedAt: string;
  storeId: Id | null;
  lineTotalCents: number | null;
  quantityMilli: number;
  unit: LineUnit;
}

/** A line as the item rules read it. */
export interface LineForItems {
  kind: "item" | "fee";
  rawName: string | null;
  itemCode: string | null;
}

/**
 * What `receipts` needs from `catalog` (SPEC.md §4.3): identifying stores and items, suggesting
 * them, creating them, and learning from confirmed receipts. Synchronous, so it can share a
 * transaction with the receipt's own changes. Supplied by `catalog`, wired in the composition root.
 */
export interface Catalog {
  identifyStore(evidence: StoreEvidence): { storeId: Id; match: StoreMatch } | undefined;
  reviewStore(evidence: StoreEvidence): { issue: StoreIssue; suggestions: StoreSuggestion[] };
  learnFromConfirmedReceipt(input: {
    receiptId: Id;
    storeId: Id;
    evidence: StoreEvidence;
    previous: { storeId: Id | null; matchedBy: StoreMatchedBy | null; alreadyCounted: boolean };
    /** Lines with an item; `alreadyCounted` when the receipt was confirmed before with that item. */
    lines: readonly (LineForItems & { itemId: Id; alreadyCounted: boolean })[];
    answers: readonly IdentifierAnswer[];
  }): Result<{ notices: LearningNotice[] }, { kind: "needs-answers"; questions: IdentifierQuestion[] }>;
  /** The item each line matches by a known identifier, in order. */
  identifyLines(storeId: Id | null, lines: readonly LineForItems[]): (ItemRef | undefined)[];
  /** What to offer each line with no item; never applied on its own. */
  suggestLines(
    storeId: Id | null,
    lines: readonly (LineForItems & { suggestedName: string | null })[],
  ): (LineItemSuggestion | null)[];
  createItem(
    name: string,
    nameSource: ItemNameSource,
    labels?: { categoryId: Id | null; tagIds: readonly Id[] },
  ): ItemRef;
  /** Each item's category and tags (SPEC.md §5). */
  itemLabels(ids: readonly Id[]): Map<Id, { categoryId: Id | null; tagIds: readonly Id[] }>;
  storeDefaultCategory(storeId: Id): Id | null;
  /** Which of these hierarchy entries and tags exist; others are dropped from a confirm. */
  knownCategoryIds(ids: readonly Id[]): Set<Id>;
  knownTagIds(ids: readonly Id[]): Set<Id>;
  findItem(id: Id): ItemRef | undefined;
  itemRefs(ids: readonly Id[]): Map<Id, ItemRef>;
  createStore(name: string): Result<StoreRef, { kind: "name-taken" }>;
  findStore(id: Id): StoreRef | undefined;
  storeRefs(ids: readonly Id[]): Map<Id, StoreRef>;
}

/**
 * Told about each new receipt inside the transaction that saves it, so the follow-up work (an
 * extraction job) is saved with it or not at all. Wired by the composition root, since the
 * module that does the work depends on `receipts` (SPEC.md §4.3). Synchronous, like repositories.
 */
export interface ReceiptUploadedListener {
  receiptUploaded(receiptId: Id): void;
}

/**
 * Stores receipt images and imported files (SPEC.md §4.1). Keys are opaque paths made of
 * lowercase letters, digits, `-`, `.` and `/`.
 */
export interface FileStore {
  /** Writes the whole file or nothing, replacing any file already at the key. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** Undefined if there is no file at the key. */
  get(key: string): Promise<Uint8Array | undefined>;
  /** Does nothing if there is no file at the key. */
  delete(key: string): Promise<void>;
}

/** Reads and re-encodes images the browser couldn't (HEIC) or didn't shrink (SPEC.md §6.1). */
export interface ImageConverter {
  /** The image's size in pixels, or undefined if it can't be read. */
  inspect(bytes: Uint8Array): Promise<PixelSize | undefined>;
  /** The image as a JPEG of exactly `size`, or undefined if it can't be read. */
  toJpeg(bytes: Uint8Array, size: PixelSize): Promise<Uint8Array | undefined>;
}

/** Household members' display names, for showing who logged a receipt. Supplied by `auth`. */
export interface UserDirectory {
  /** Unknown ids are left out. */
  displayNames(ids: readonly Id[]): Map<Id, string>;
}
