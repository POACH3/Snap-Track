import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PixelSize } from "@snaptrack/core";
import type { ImageConverter } from "../ports.ts";

const run = promisify(execFile);

/** Longest a single sips call may take; a receipt photo takes well under a second. */
const SIPS_TIMEOUT_MS = 60_000;
const JPEG_QUALITY = 85;

/**
 * Converts with macOS's built-in `sips` (ADR 0005): no package to install, and it reads HEIC
 * natively. sips exits 0 even when it can't read a file (it prints `<nil>`), so results are
 * checked from its output and the file it wrote, not its exit code.
 */
export class SipsImageConverter implements ImageConverter {
  readonly #sips: string;

  constructor(sipsPath = "/usr/bin/sips") {
    this.#sips = sipsPath;
  }

  async inspect(bytes: Uint8Array): Promise<PixelSize | undefined> {
    return this.#inTempFolder(bytes, async (input) => {
      const { stdout } = await run(this.#sips, ["-g", "pixelWidth", "-g", "pixelHeight", input], {
        timeout: SIPS_TIMEOUT_MS,
      });
      const width = /pixelWidth: (\d+)/.exec(stdout)?.[1];
      const height = /pixelHeight: (\d+)/.exec(stdout)?.[1];
      if (width === undefined || height === undefined) return undefined;
      return { width: Number(width), height: Number(height) };
    });
  }

  async toJpeg(bytes: Uint8Array, size: PixelSize): Promise<Uint8Array | undefined> {
    return this.#inTempFolder(bytes, async (input, folder) => {
      const output = join(folder, "output.jpg");
      const args = ["-s", "format", "jpeg", "-s", "formatOptions", String(JPEG_QUALITY)];
      // -z takes the height first.
      args.push("-z", String(size.height), String(size.width), input, "--out", output);
      await run(this.#sips, args, { timeout: SIPS_TIMEOUT_MS });
      return new Uint8Array(await readFile(output));
    });
  }

  /** Runs `work` on a private copy of the image; undefined if sips fails or wrote nothing. */
  async #inTempFolder<T>(
    bytes: Uint8Array,
    work: (input: string, folder: string) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    const folder = await mkdtemp(join(tmpdir(), "snaptrack-sips-"));
    try {
      const input = join(folder, "input");
      await writeFile(input, bytes);
      return await work(input, folder);
    } catch {
      return undefined;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
}
