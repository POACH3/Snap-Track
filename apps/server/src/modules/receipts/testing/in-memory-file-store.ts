import { assertValidKey } from "../domain/file-key.ts";
import type { FileStore } from "../ports.ts";

/** Keeps files in memory. Behaves like the file-system adapter (see file-store.contract.test.ts). */
export class InMemoryFileStore implements FileStore {
  readonly files = new Map<string, Uint8Array>();

  // Each method fails by rejecting, never by throwing, like the real (async) adapter.
  put(key: string, bytes: Uint8Array): Promise<void> {
    return Promise.resolve().then(() => {
      assertValidKey(key);
      this.files.set(key, bytes.slice());
    });
  }

  get(key: string): Promise<Uint8Array | undefined> {
    return Promise.resolve().then(() => {
      assertValidKey(key);
      return this.files.get(key)?.slice();
    });
  }

  delete(key: string): Promise<void> {
    return Promise.resolve().then(() => {
      assertValidKey(key);
      this.files.delete(key);
    });
  }
}
