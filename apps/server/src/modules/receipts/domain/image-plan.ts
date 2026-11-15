import { MAX_RECEIPT_IMAGE_PIXELS, fitWithinPixels, fitWithinSide, type PixelSize } from "@snaptrack/core";
import type { ImageFormat } from "./image-format.ts";

/** Thumbnails for the receipts list: longest side at most this many pixels. */
export const THUMBNAIL_MAX_SIDE = 400;

export type StoragePlan = { kind: "keep" } | { kind: "convert"; size: PixelSize };

/**
 * How an uploaded image is stored. The client already shrinks photos to the §6.1 limit and
 * sends a JPEG, which is kept as sent. Anything else (HEIC or PNG the browser couldn't
 * shrink, or a JPEG over the limit) becomes a JPEG at the §6.1 size.
 */
export function planStoredImage(format: ImageFormat, size: PixelSize): StoragePlan {
  const fitted = fitWithinPixels(size, MAX_RECEIPT_IMAGE_PIXELS);
  const withinLimit = fitted.width === size.width && fitted.height === size.height;
  if (format === "jpeg" && withinLimit) return { kind: "keep" };
  return { kind: "convert", size: fitted };
}

export function thumbnailSize(size: PixelSize): PixelSize {
  return fitWithinSide(size, THUMBNAIL_MAX_SIDE);
}
