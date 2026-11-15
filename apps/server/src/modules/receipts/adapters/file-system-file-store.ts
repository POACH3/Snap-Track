import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { assertValidKey } from "../domain/file-key.ts";
import type { FileStore } from "../ports.ts";

const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");

/** Files under one folder (`IMAGE_DIR`), one file per key. */
export class FileSystemFileStore implements FileStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  #pathFor(key: string): string {
    assertValidKey(key);
    const path = join(this.#root, ...key.split("/"));
    // Valid keys can't climb out of the folder; this is a second guard.
    if (!path.startsWith(this.#root + sep)) throw new Error(`File key escapes the store: ${key}`);
    return path;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.#pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    // Write beside it, then rename: a crash never leaves half a file at the key.
    const temporary = `${path}.${randomUUID()}.partial`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(this.#pathFor(key)));
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.#pathFor(key), { force: true });
  }
}
