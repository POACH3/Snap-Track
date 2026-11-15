import { MAX_RECEIPT_IMAGE_PIXELS, fitWithinPixels } from "@snaptrack/core";

const JPEG_QUALITY = 0.85;

/**
 * Shrinks a photo to the §6.1 pixel limit and re-encodes it as JPEG (which also drops its
 * location and other metadata). The browser applies the photo's rotation while decoding. If the
 * browser can't decode it (e.g. HEIC in Chrome on a desktop) or runs out of memory, the original
 * file is returned and the server converts and shrinks it instead.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const size = fitWithinPixels({ width: bitmap.width, height: bitmap.height }, MAX_RECEIPT_IMAGE_PIXELS);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (context === null) return file;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    return blob ?? file;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/** Whether the browser can show this blob in an `<img>` (a JPEG it made itself, or any image it decoded). */
export const canPreview = (original: File, prepared: Blob) =>
  prepared !== original || original.type === "image/jpeg" || original.type === "image/png";

/** Image files people may choose. HEIC is named too, since some browsers leave it out of `image/*`. */
export const ACCEPTED_PHOTOS = "image/*,.heic,.heif";

export function isPhotoFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}
