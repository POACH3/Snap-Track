import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import type { PixelSize } from "@snaptrack/core";
import type { ImageFormat } from "../domain/image-format.ts";

// Real image files for adapter tests, made without any image library: PNG is written by hand,
// and JPEG and HEIC are converted from it with sips (macOS only, like the adapter under test).

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A grey-gradient RGB PNG of the given size. */
export function makePng(size: PixelSize): Uint8Array<ArrayBuffer> {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size.width, 0);
  header.writeUInt32BE(size.height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  const row = 1 + size.width * 3;
  const pixels = Buffer.alloc(row * size.height);
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) pixels.fill((x + y) % 256, y * row + 1 + x * 3, y * row + 4 + x * 3);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", new Uint8Array()),
  ]);
  return new Uint8Array(png);
}

const run = promisify(execFile);

/** A real image in the given format, made with sips. */
export async function makeRealImage(format: ImageFormat, size: PixelSize): Promise<Uint8Array<ArrayBuffer>> {
  const png = makePng(size);
  if (format === "png") return png;
  const folder = await mkdtemp(join(tmpdir(), "snaptrack-test-"));
  try {
    await writeFile(join(folder, "in.png"), png);
    const out = join(folder, `out.${format}`);
    await run("/usr/bin/sips", ["-s", "format", format, join(folder, "in.png"), "--out", out]);
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
