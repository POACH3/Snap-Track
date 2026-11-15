import type { ReceiptSummary } from "@snaptrack/contracts";
import { err, newId, ok, sha256Hex, type Id, type Result, type Transaction } from "@snaptrack/core";
import { detectImageFormat } from "../domain/image-format.ts";
import { receiptImageKeys } from "../domain/image-keys.ts";
import { planStoredImage, thumbnailSize } from "../domain/image-plan.ts";
import { decodeCursor, encodeCursor, normalizeTimestamp } from "../domain/list-cursor.ts";
import type { ReceiptImage, ReceiptWithImages } from "../domain/receipt.ts";
import type { FileStore, ImageConverter, ReceiptRepository, UserDirectory } from "../ports.ts";

export interface ReceiptsDeps {
  receipts: ReceiptRepository;
  files: FileStore;
  converter: ImageConverter;
  users: UserDirectory;
  transaction: Transaction;
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
        } as const;
        // False when another copy of this upload got there first; its files are the ones kept.
        saved = deps.transaction.run(() => deps.receipts.insert(receipt, rows));
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

    /** An image's bytes (always JPEG), or undefined if there is no such image or it was deleted. */
    async readImage(imageId: Id, variant: ImageVariant): Promise<Uint8Array | undefined> {
      const image = deps.receipts.findImage(imageId);
      const key = variant === "image" ? image?.imageKey : image?.thumbnailKey;
      if (key === undefined || key === null) return undefined;
      return deps.files.get(key);
    },
  };
}
