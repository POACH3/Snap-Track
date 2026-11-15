import type { PixelSize } from "@snaptrack/core";
import type { ImageConverter } from "../ports.ts";
import { fakeImage, readFakeImageSize } from "./fake-images.ts";

/** Works on `fakeImage` files. Behaves like the sips adapter (see image-converter.contract.test.ts). */
export class FakeImageConverter implements ImageConverter {
  /** Every conversion asked for, in order. */
  readonly conversions: PixelSize[] = [];
  /** Set to make every `toJpeg` fail from that call on, for testing cleanup. */
  failAfter = Number.POSITIVE_INFINITY;

  inspect(bytes: Uint8Array): Promise<PixelSize | undefined> {
    return Promise.resolve(readFakeImageSize(bytes));
  }

  toJpeg(bytes: Uint8Array, size: PixelSize): Promise<Uint8Array | undefined> {
    if (readFakeImageSize(bytes) === undefined || this.conversions.length >= this.failAfter) {
      return Promise.resolve(undefined);
    }
    this.conversions.push(size);
    return Promise.resolve(fakeImage("jpeg", size));
  }
}
