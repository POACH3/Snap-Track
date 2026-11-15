export type ImageFormat = "jpeg" | "png" | "heic";

// HEIF brands written by phones and cameras (ISO/IEC 23008-12). `mif1`/`msf1` are the generic HEIF brands.
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/**
 * The format of an image file, read from its first bytes rather than its name or the
 * browser's claimed type, which are often missing or wrong for HEIC. Undefined if not a
 * format SnapTrack accepts (SPEC.md §6.1).
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(bytes, 8, 12))) {
    return "heic";
  }
  return undefined;
}
