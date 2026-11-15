import type { Id, PixelSize } from "@snaptrack/core";
import type { ListPosition } from "./domain/list-cursor.ts";
import type { Receipt, ReceiptImage, ReceiptWithImages } from "./domain/receipt.ts";

/** Repositories are synchronous (SPEC.md §3.1 rule 7). */
export interface ReceiptRepository {
  findById(id: Id): ReceiptWithImages | undefined;
  /** Saves a receipt and all its images. Returns false, saving nothing, if the id is taken. */
  insert(receipt: Receipt, images: readonly ReceiptImage[]): boolean;
  /** Newest first by capture time, then id; only receipts after `after` when given. */
  list(options: { after: ListPosition | undefined; limit: number }): ReceiptWithImages[];
  findImage(imageId: Id): ReceiptImage | undefined;
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
