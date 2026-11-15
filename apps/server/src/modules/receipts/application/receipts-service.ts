import type { ExtractedReceipt, ReceiptSummary } from "@snaptrack/contracts";
import { err, newId, ok, sha256Hex, type Id, type Result, type Transaction } from "@snaptrack/core";
import { fromExtraction, hasUsableAmounts } from "../domain/extracted-data.ts";
import { detectImageFormat } from "../domain/image-format.ts";
import { receiptImageKeys } from "../domain/image-keys.ts";
import { planStoredImage, thumbnailSize } from "../domain/image-plan.ts";
import { decodeCursor, encodeCursor, normalizeTimestamp } from "../domain/list-cursor.ts";
import { EXTRACTION_STATUSES, type ReceiptImage, type ReceiptWithImages } from "../domain/receipt.ts";
import type {
  FileStore,
  ImageConverter,
  ReceiptRepository,
  ReceiptUploadedListener,
  UserDirectory,
} from "../ports.ts";

export interface ReceiptsDeps {
  receipts: ReceiptRepository;
  files: FileStore;
  converter: ImageConverter;
  users: UserDirectory;
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
    return rows.map(({ receipt, images }) => ({
      id: receipt.id,
      status: receipt.status,
      source: receipt.source,
      capturedAt: receipt.capturedAt,
      totalCents: receipt.totalCents,
      loggedBy: {
        id: receipt.loggedByUserId,
        displayName: names.get(receipt.loggedByUserId) ?? UNKNOWN_USER,
      },
      images: images.map((image) => ({ id: image.id, position: image.position })),
    }));
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
          totalCents: null,
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
    }): Result<{ receipts: ReceiptSummary[]; nextCursor: string | null }, ListReceiptsError> {
      const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
      if (input.cursor !== undefined && after === undefined) return err({ kind: "invalid-cursor" });
      // One extra row says whether there is another page.
      const rows = deps.receipts.list({ after, limit: input.limit + 1 });
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > input.limit && last !== undefined
          ? encodeCursor({ capturedAt: last.receipt.capturedAt, id: last.receipt.id })
          : null;
      return ok({ receipts: toSummaries(page), nextCursor });
    },

    getReceipt(id: Id): ReceiptSummary | undefined {
      return summaryOf(id);
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
      deps.receipts.saveExtraction(receiptId, result, status);
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
