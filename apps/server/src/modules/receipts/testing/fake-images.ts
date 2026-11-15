import type { PixelSize } from "@snaptrack/core";
import type { ImageFormat } from "../domain/image-format.ts";

// Fake image files: a real format signature followed by the size as text, so the fake
// converter can "read" them and format detection treats them like the real thing.
const SIGNATURES: Record<ImageFormat, number[]> = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  heic: [0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic")],
};

export function fakeImage(format: ImageFormat, size: PixelSize, tag = ""): Uint8Array<ArrayBuffer> {
  const text = new TextEncoder().encode(`|${size.width}x${size.height}|${tag}`);
  return new Uint8Array([...SIGNATURES[format], ...text]);
}

/** The size written into a fake image, or undefined if `bytes` isn't one. */
export function readFakeImageSize(bytes: Uint8Array): PixelSize | undefined {
  const match = /\|(\d+)x(\d+)\|/.exec(new TextDecoder("latin1").decode(bytes));
  return match ? { width: Number(match[1]), height: Number(match[2]) } : undefined;
}
