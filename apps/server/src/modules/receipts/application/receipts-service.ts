import type {
  ConfirmReceiptRequest,
  ConsistencyWarning,
  ExtractedReceipt,
  IdentifierAnswer,
  IdentifierQuestion,
  LearningNotice,
  ReceiptDetail,
  ReceiptDraft,
  ReceiptSummary,
  StoreChoice,
  StoreRef,
} from "@snaptrack/contracts";
import { err, newId, ok, sha256Hex, type Id, type Result, type Transaction } from "@snaptrack/core";
import { checkConsistency } from "../domain/consistency.ts";
import { fromExtraction, hasUsableAmounts } from "../domain/extracted-data.ts";
import { detectImageFormat } from "../domain/image-format.ts";
import { receiptImageKeys } from "../domain/image-keys.ts";
import { planStoredImage, thumbnailSize } from "../domain/image-plan.ts";
import { decodeCursor, encodeCursor, normalizeTimestamp } from "../domain/list-cursor.ts";
import {
  EXTRACTION_STATUSES,
  type ReceiptImage,
  type ReceiptRecord,
  type ReceiptWithImages,
} from "../domain/receipt.ts";
import {
  asLineItems,
  dataFromDraft,
  draftOf,
  linesFromDraft,
  receiptAmount,
  type ReviewedLine,
} from "../domain/review.ts";
import type {
  FileStore,
  ImageConverter,
  ReceiptRepository,
  ReceiptStore,
  ReceiptUploadedListener,
  Catalog,
  UserDirectory,
} from "../ports.ts";

export interface ReceiptsDeps {
  receipts: ReceiptRepository;
  files: FileStore;
  converter: ImageConverter;
  users: UserDirectory;
  catalog: Catalog;
  transaction: Transaction;
  /** Told about each new receipt in the transaction that saves it. */
  onUploaded?: ReceiptUploadedListener;
}

export interface PutReceiptCommand {
  id: Id;
  capturedAt: string;
  /** In order, top of the receipt first. */
  images: readonly Uint8Array<ArrayBuffer>[];
}

export type PutReceiptError = { kind: "unsupported-image"; position: number };
export type ListReceiptsError = { kind: "invalid-cursor" };
export type ReceiptNotFound = { kind: "receipt-not-found" };
export type ConfirmError =
  | ReceiptNotFound
  | { kind: "store-not-found" }
  | { kind: "name-taken" }
  | { kind: "receipt-changed" }
  | { kind: "needs-answers"; questions: IdentifierQuestion[] };

export interface ConfirmResult {
  receipt: ReceiptDetail;
  notices: LearningNotice[];
  /** Other receipts with no store that would now be matched; offered to the user, not applied. */
  rematchCount: number;
  /** Earlier lines with no item that would now be matched; offered with `rematchCount`. */
  itemRematchCount: number;
}

/** Thrown inside a transaction to undo it, carrying the error to return. Never escapes `confirm`. */
class Undo extends Error {
  readonly error: ConfirmError;
  constructor(error: ConfirmError) {
    super(error.kind);
    this.error = error;
  }
}

export type ImageVariant = "image" | "thumbnail";

/** Shown for a receipt whose user no longer exists. Users are never deleted, so this is a safeguard. */
const UNKNOWN_USER = "Unknown";

interface PreparedImage {
  id: Id;
  stored: Uint8Array<ArrayBuffer>;
  thumbnail: Uint8Array;
  sha256: string;
}

export type ReceiptsService = ReturnType<typeof createReceiptsService>;

export function createReceiptsService(deps: ReceiptsDeps) {
  function toSummaries(rows: readonly ReceiptWithImages[]): ReceiptSummary[] {
    const names = deps.users.displayNames(rows.map((row) => row.receipt.loggedByUserId));
    const stores = deps.catalog.storeRefs(
      rows.flatMap((row) => (row.receipt.storeId === null ? [] : [row.receipt.storeId])),
    );
    return rows.map(({ receipt, images }) => ({
      id: receipt.id,
      status: receipt.status,
      source: receipt.source,
      capturedAt: receipt.capturedAt,
      purchasedAt: receipt.purchasedAt,
      totalCents: receiptAmount(receipt),
      store: (receipt.storeId === null ? undefined : stores.get(receipt.storeId)) ?? null,
      loggedBy: {
        id: receipt.loggedByUserId,
        displayName: names.get(receipt.loggedByUserId) ?? UNKNOWN_USER,
      },
      images: images.map((image) => ({ id: image.id, position: image.position })),
    }));
  }

  function warningsFor(record: ReceiptRecord, draft: ReceiptDraft): ConsistencyWarning[] {
    return checkConsistency(
      dataFromDraft(draft, record.data.rawText),
      asLineItems(linesFromDraft(draft.lines)),
      new Date(record.createdAt),
    );
  }

  function detailOf(record: ReceiptRecord): ReceiptDetail {
    const [summary] = toSummaries([record]);
    if (summary === undefined) throw new Error(`No summary for receipt ${record.receipt.id}`);
    const confirmedBy =
      record.confirmedByUserId === null
        ? null
        : {
            id: record.confirmedByUserId,
            displayName:
              deps.users.displayNames([record.confirmedByUserId]).get(record.confirmedByUserId) ??
              UNKNOWN_USER,
          };
    const review =
      record.receipt.storeId === null ? deps.catalog.reviewStore(record.data.storeEvidence) : undefined;
    const items = deps.catalog.itemRefs(
      record.lines.flatMap((line) => (line.itemId === null ? [] : [line.itemId])),
    );
    // Lines with no item get what to offer, worked out now with the identifiers known now.
    const open = record.lines.filter((line) => line.itemId === null);
    const offered = deps.catalog.suggestLines(
      record.receipt.storeId,
      open.map((line) => ({ ...line, suggestedName: line.suggestedItemName })),
    );
    const suggestions = new Map(open.map((line, index) => [line.id, offered[index] ?? null]));
    const draft = draftOf(record.data, record.note, record.lines, items, suggestions);
    return {
      ...summary,
      updatedAt: record.updatedAt,
      storeMatchedBy: record.storeMatchedBy,
      storeMatch: record.storeMatch,
      storeIssue: review?.issue ?? null,
      storeSuggestions: review?.suggestions ?? [],
      draft,
      rawText: record.data.rawText,
      confirmedAt: record.confirmedAt,
      confirmedBy,
      warnings: warningsFor(record, draft),
    };
  }

  /** The store a person chose, creating a new one if asked. Inside the confirm's transaction. */
  function resolveStore(choice: StoreChoice): StoreRef {
    if (choice.kind === "existing") {
      const store = deps.catalog.findStore(choice.storeId);
      if (store === undefined) throw new Undo({ kind: "store-not-found" });
      return store;
    }
    const created = deps.catalog.createStore(choice.name);
    if (!created.ok) throw new Undo({ kind: "name-taken" });
    return created.value;
  }

  /**
   * Each line's item for a confirm: the one chosen, a new one created now (named as the form says),
   * or, for a line with none, the item its identifiers match at `storeId`; else none.
   */
  function resolveItems(record: ReceiptRecord, draft: ReceiptDraft, storeId: Id): ReviewedLine[] {
    const stored = new Map(record.lines.map((line) => [line.id, line]));
    const lines = linesFromDraft(draft.lines).map((line, index) => {
      const choice = draft.lines[index]?.item ?? null;
      if (choice === null) return line;
      if (choice.kind === "existing") {
        return { ...line, itemId: deps.catalog.findItem(choice.itemId)?.id ?? null };
      }
      const suggested = line.id === undefined ? null : (stored.get(line.id)?.suggestedItemName ?? null);
      const source = choice.name === suggested ? "model" : choice.name === line.rawName ? "printed" : "user";
      return { ...line, itemId: deps.catalog.createItem(choice.name, source).id };
    });
    const open = lines.flatMap((line, index) => (line.itemId === null ? [index] : []));
    const found = deps.catalog.identifyLines(
      storeId,
      open.map((index) => lines[index] as ReviewedLine),
    );
    open.forEach((index, i) => {
      const item = found[i];
      const line = lines[index];
      if (item !== undefined && line !== undefined) lines[index] = { ...line, itemId: item.id };
    });
    return lines;
  }

  /** How many earlier lines with no item would be matched now. */
  function countItemRematchable(): number {
    return deps.receipts
      .listLinesWithoutItem()
      .reduce(
        (n, receipt) =>
          n +
          deps.catalog.identifyLines(receipt.storeId, receipt.lines).filter((item) => item !== undefined)
            .length,
        0,
      );
  }

  /** How many receipts with no store would be matched now. */
  function countRematchable(): number {
    return deps.receipts
      .listUnidentified()
      .filter((receipt) => deps.catalog.identifyStore(receipt.evidence) !== undefined).length;
  }

  function summaryOf(id: Id): ReceiptSummary | undefined {
    const row = deps.receipts.findById(id);
    return row && toSummaries([row])[0];
  }

  /** Reads, converts if needed, and makes a thumbnail. Does no writing. */
  async function prepareImage(bytes: Uint8Array<ArrayBuffer>): Promise<PreparedImage | undefined> {
    const format = detectImageFormat(bytes);
    if (format === undefined) return undefined;
    const size = await deps.converter.inspect(bytes);
    if (size === undefined) return undefined;

    const plan = planStoredImage(format, size);
    const stored = plan.kind === "keep" ? bytes : await deps.converter.toJpeg(bytes, plan.size);
    if (stored === undefined) return undefined;
    const thumbnail = await deps.converter.toJpeg(
      stored,
      thumbnailSize(plan.kind === "keep" ? size : plan.size),
    );
    if (thumbnail === undefined) return undefined;
    return {
      id: newId(),
      stored: new Uint8Array(stored),
      thumbnail,
      sha256: await sha256Hex(new Uint8Array(stored)),
    };
  }

  async function deleteFiles(keys: readonly string[]): Promise<void> {
    await Promise.allSettled(keys.map((key) => deps.files.delete(key)));
  }

  return {
    /**
     * Saves an uploaded receipt (SPEC.md §6.2). Idempotent: if the receipt already exists, nothing
     * changes and its current state comes back. A receipt never exists without all its images:
     * files are written first, then every row in one transaction.
     */
    async putReceipt(
      command: PutReceiptCommand,
      loggedByUserId: Id,
    ): Promise<Result<ReceiptSummary, PutReceiptError>> {
      const existing = summaryOf(command.id);
      if (existing !== undefined) return ok(existing);

      const prepared: PreparedImage[] = [];
      for (const [position, bytes] of command.images.entries()) {
        const image = await prepareImage(bytes);
        if (image === undefined) return err({ kind: "unsupported-image", position });
        prepared.push(image);
      }

      const written: string[] = [];
      let saved = false;
      try {
        const rows: ReceiptImage[] = [];
        for (const [position, image] of prepared.entries()) {
          const keys = receiptImageKeys(command.id, image.id);
          await deps.files.put(keys.image, image.stored);
          written.push(keys.image);
          await deps.files.put(keys.thumbnail, image.thumbnail);
          written.push(keys.thumbnail);
          rows.push({
            id: image.id,
            receiptId: command.id,
            position,
            imageKey: keys.image,
            thumbnailKey: keys.thumbnail,
            imageSha256: image.sha256,
          });
        }
        const receipt = {
          id: command.id,
          loggedByUserId,
          source: "photo",
          status: "uploaded",
          capturedAt: normalizeTimestamp(command.capturedAt),
        } as const;
        // False when another copy of this upload got there first; its files are the ones kept.
        saved = deps.transaction.run(() => {
          const inserted = deps.receipts.insert(receipt, rows);
          if (inserted) deps.onUploaded?.receiptUploaded(command.id);
          return inserted;
        });
      } finally {
        if (!saved) await deleteFiles(written);
      }

      const summary = summaryOf(command.id);
      if (summary === undefined) throw new Error(`Receipt ${command.id} missing right after saving it`);
      return ok(summary);
    },

    listReceipts(input: {
      cursor: string | undefined;
      limit: number;
      status?: "unreviewed" | "review_required" | undefined;
    }): Result<{ receipts: ReceiptSummary[]; nextCursor: string | null }, ListReceiptsError> {
      const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
      if (input.cursor !== undefined && after === undefined) return err({ kind: "invalid-cursor" });
      // One extra row says whether there is another page.
      const rows = deps.receipts.list({ after, limit: input.limit + 1, status: input.status });
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > input.limit && last !== undefined
          ? encodeCursor({ capturedAt: last.receipt.capturedAt, id: last.receipt.id })
          : null;
      return ok({ receipts: toSummaries(page), nextCursor });
    },

    /** Everything about one receipt, with the store suggestions and warnings worked out now. */
    getReceipt(id: Id): ReceiptDetail | undefined {
      const record = deps.receipts.findRecord(id);
      return record && detailOf(record);
    },

    /** The warnings for a form's current figures. Saves nothing. */
    checkDraft(id: Id, draft: ReceiptDraft): Result<ConsistencyWarning[], ReceiptNotFound> {
      const record = deps.receipts.findRecord(id);
      return record === undefined ? err({ kind: "receipt-not-found" }) : ok(warningsFor(record, draft));
    },

    /**
     * Saves a review, marks the receipt confirmed and learns its store's identifiers, all in one
     * transaction (SPEC.md §6.5, §6.7). Also saves edits to a confirmed receipt. Nothing is saved
     * if the receipt changed since the form loaded it, or while a question about moving an
     * identifier has no answer.
     */
    confirm(
      input: ConfirmReceiptRequest & { answers: IdentifierAnswer[] },
      userId: Id,
    ): Result<ConfirmResult, ConfirmError> {
      let notices: LearningNotice[];
      try {
        notices = deps.transaction.run(() => {
          const record = deps.receipts.findRecord(input.id);
          if (record === undefined) throw new Undo({ kind: "receipt-not-found" });
          if (record.updatedAt !== input.expectedUpdatedAt) throw new Undo({ kind: "receipt-changed" });

          const store = resolveStore(input.store);
          const previous = { storeId: record.receipt.storeId, matchedBy: record.storeMatchedBy };
          const lines = resolveItems(record, input.draft, store.id);
          const wasConfirmed = record.receipt.status === "confirmed";
          const before = new Map(record.lines.map((line) => [line.id, line.itemId]));
          const learned = deps.catalog.learnFromConfirmedReceipt({
            receiptId: input.id,
            storeId: store.id,
            evidence: input.draft.storeEvidence,
            previous: {
              ...previous,
              alreadyCounted: wasConfirmed && previous.storeId === store.id,
            },
            lines: lines.flatMap((line) =>
              line.itemId === null
                ? []
                : [
                    {
                      ...line,
                      itemId: line.itemId,
                      alreadyCounted:
                        wasConfirmed && line.id !== undefined && before.get(line.id) === line.itemId,
                    },
                  ],
            ),
            answers: input.answers,
          });
          if (!learned.ok) throw new Undo(learned.error);

          // Confirming the store that was matched keeps the explanation of how it was matched.
          const matchedBy = record.storeMatchedBy;
          const receiptStore: ReceiptStore =
            previous.storeId === store.id && matchedBy !== null
              ? { storeId: store.id, matchedBy, match: record.storeMatch }
              : { storeId: store.id, matchedBy: "user", match: null };
          deps.receipts.saveReview(input.id, {
            data: dataFromDraft(input.draft, record.data.rawText),
            lines,
            note: input.draft.note,
            store: receiptStore,
            confirmedByUserId: userId,
          });
          return learned.value.notices;
        });
      } catch (error) {
        if (error instanceof Undo) return err(error.error);
        throw error;
      }
      const record = deps.receipts.findRecord(input.id);
      if (record === undefined) throw new Error(`Receipt ${input.id} missing right after confirming it`);
      return ok({
        receipt: detailOf(record),
        notices,
        rematchCount: countRematchable(),
        itemRematchCount: countItemRematchable(),
      });
    },

    /** How many receipts are waiting for a person (SPEC.md §6.5). */
    countWaiting(): { unreviewed: number; reviewRequired: number } {
      return deps.receipts.countWaiting();
    },

    /**
     * Sets the store of every unconfirmed receipt with none whose identifiers now match one, then
     * the item of every earlier line with none whose identifiers now match one (SPEC.md §6.4). Run
     * only when the user agrees. Returns how many of each changed.
     */
    rematch(): { matched: number; items: number } {
      return deps.transaction.run(() => {
        let matched = 0;
        for (const receipt of deps.receipts.listUnidentified()) {
          const found = deps.catalog.identifyStore(receipt.evidence);
          if (found === undefined) continue;
          const store = { storeId: found.storeId, matchedBy: "identifier" as const, match: found.match };
          if (deps.receipts.setIdentifiedStore(receipt.id, store)) matched++;
        }
        let items = 0;
        for (const receipt of deps.receipts.listLinesWithoutItem()) {
          const found = deps.catalog.identifyLines(receipt.storeId, receipt.lines);
          receipt.lines.forEach((line, index) => {
            const item = found[index];
            if (item !== undefined && deps.receipts.setLineItem(line.id, item.id)) items++;
          });
        }
        return { matched, items };
      });
    },

    /** An item's latest purchases, newest first, for its Library page. */
    itemPurchases(itemId: Id, limit: number) {
      const rows = deps.receipts.itemPurchases(itemId, limit);
      const stores = deps.catalog.storeRefs(
        rows.flatMap((row) => (row.storeId === null ? [] : [row.storeId])),
      );
      return rows.map(({ storeId, ...row }) => ({
        ...row,
        store: (storeId === null ? undefined : stores.get(storeId)) ?? null,
      }));
    },

    /**
     * A receipt's photos in order, for extraction. Undefined if the receipt is unknown or any
     * photo is gone (deleted under the retention rules), since the model must see every one.
     */
    async imagesForExtraction(receiptId: Id): Promise<Uint8Array[] | undefined> {
      const row = deps.receipts.findById(receiptId);
      if (row === undefined || row.images.length === 0) return undefined;
      const images: Uint8Array[] = [];
      for (const image of row.images) {
        const bytes = image.imageKey === null ? undefined : await deps.files.get(image.imageKey);
        if (bytes === undefined) return undefined;
        images.push(bytes);
      }
      return images;
    },

    /** Extraction started or was put off. Leaves a receipt a person has handled alone. */
    setExtractionStatus(receiptId: Id, status: "extracting" | "uploaded"): void {
      deps.receipts.setStatus(receiptId, status, EXTRACTION_STATUSES);
    },

    /**
     * Saves what the model read and returns the receipt's new status: `unreviewed`, or
     * `review_required` when it found no amounts at all (SPEC.md §5 Rules). Everything read is
     * kept either way, to help the person who fills it in. Synchronous, so it can share a
     * transaction with the job's own update.
     */
    saveExtraction(receiptId: Id, extracted: ExtractedReceipt): "unreviewed" | "review_required" {
      const result = fromExtraction(extracted);
      const status = hasUsableAmounts(result) ? "unreviewed" : "review_required";
      const current = deps.receipts.findById(receiptId)?.receipt.status;
      if (current === undefined || !(EXTRACTION_STATUSES as readonly string[]).includes(current))
        return status;
      // Only a known identifier sets the store; anything less waits for a person (SPEC.md §6.4).
      const found = deps.catalog.identifyStore(result.data.storeEvidence);
      // Items too: by barcode always, by code and printed name once the store is known (§6.4 step 2).
      const items = deps.catalog.identifyLines(found?.storeId ?? null, result.lines);
      deps.receipts.saveExtraction(
        receiptId,
        result,
        status,
        found && { storeId: found.storeId, matchedBy: "identifier", match: found.match },
        items.map((item) => item?.id ?? null),
      );
      return status;
    },

    /** The model couldn't read it: a person enters the data from the photo (SPEC.md §6.3). */
    markReviewRequired(receiptId: Id): void {
      deps.receipts.setStatus(receiptId, "review_required", EXTRACTION_STATUSES);
    },

    /** An image's bytes (always JPEG), or undefined if there is no such image or it was deleted. */
    async readImage(imageId: Id, variant: ImageVariant): Promise<Uint8Array | undefined> {
      const image = deps.receipts.findImage(imageId);
      const key = variant === "image" ? image?.imageKey : image?.thumbnailKey;
      if (key === undefined || key === null) return undefined;
      return deps.files.get(key);
    },
  };
}
