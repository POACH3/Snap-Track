/** Size of an image in pixels. */
export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Receipt photos are shrunk to at most this many pixels before upload or storage (SPEC.md §6.1).
 * The limit is on total pixels, not the longest side, so a long, narrow receipt keeps enough
 * width to read.
 */
export const MAX_RECEIPT_IMAGE_PIXELS = 4_000_000;

/**
 * The largest size with the same shape as `size` that has at most `maxPixels` pixels.
 * Never enlarges. Both sides stay at least 1 pixel.
 */
export function fitWithinPixels(size: PixelSize, maxPixels: number): PixelSize {
  const { width, height } = size;
  if (width * height <= maxPixels) return { width, height };
  const scale = Math.sqrt(maxPixels / (width * height));
  // Rounding down keeps the result within the limit. A side clamped up to 1 pixel caps the other.
  const fittedWidth = Math.max(1, Math.floor(width * scale));
  const fittedHeight = Math.max(1, Math.min(Math.floor(height * scale), Math.floor(maxPixels / fittedWidth)));
  return { width: fittedWidth, height: fittedHeight };
}

/** The largest size with the same shape as `size` whose longest side is at most `maxSide`. Never enlarges. */
export function fitWithinSide(size: PixelSize, maxSide: number): PixelSize {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxSide) return { width: size.width, height: size.height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}
