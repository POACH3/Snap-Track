// Port contract test (SPEC.md §3.5): the fake must behave like the real adapter. The sips
// adapter runs only on macOS, where SnapTrack is hosted (ADR 0005).
import type { PixelSize } from "@snaptrack/core";
import { describe, expect, it } from "vitest";
import { SipsImageConverter } from "../adapters/sips-image-converter.ts";
import { detectImageFormat, type ImageFormat } from "../domain/image-format.ts";
import type { ImageConverter } from "../ports.ts";
import { FakeImageConverter } from "./fake-image-converter.ts";
import { fakeImage } from "./fake-images.ts";
import { makeRealImage } from "./real-images.ts";

type MakeImage = (format: ImageFormat, size: PixelSize) => Promise<Uint8Array<ArrayBuffer>>;

const implementations: [string, () => ImageConverter, MakeImage][] = [
  [
    "FakeImageConverter",
    () => new FakeImageConverter(),
    (format, size) => Promise.resolve(fakeImage(format, size)),
  ],
];
if (process.platform === "darwin") {
  implementations.push(["SipsImageConverter", () => new SipsImageConverter(), makeRealImage]);
}

const junk = new TextEncoder().encode("this is not an image at all");

describe.each(implementations)("ImageConverter contract: %s", (_name, create, makeImage) => {
  it.each<ImageFormat>(["jpeg", "png", "heic"])("reads the size of a %s image", async (format) => {
    const image = await makeImage(format, { width: 120, height: 300 });
    expect(await create().inspect(image)).toEqual({ width: 120, height: 300 });
  });

  it("converts HEIC to a JPEG of exactly the requested size", async () => {
    const converter = create();
    const heic = await makeImage("heic", { width: 200, height: 100 });
    const jpeg = await converter.toJpeg(heic, { width: 80, height: 40 });
    expect(jpeg && detectImageFormat(jpeg)).toBe("jpeg");
    expect(jpeg && (await converter.inspect(jpeg))).toEqual({ width: 80, height: 40 });
  });

  it("returns undefined for a file that isn't an image", async () => {
    const converter = create();
    expect(await converter.inspect(junk)).toBeUndefined();
    expect(await converter.toJpeg(junk, { width: 10, height: 10 })).toBeUndefined();
  });
});
