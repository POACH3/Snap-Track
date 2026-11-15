// Port contract test (SPEC.md §3.5): the fake must behave like the real adapter.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSystemFileStore } from "../adapters/file-system-file-store.ts";
import type { FileStore } from "../ports.ts";
import { InMemoryFileStore } from "./in-memory-file-store.ts";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function fileSystemStore(): Promise<FileStore> {
  const folder = await mkdtemp(join(tmpdir(), "snaptrack-files-"));
  folders.push(folder);
  return new FileSystemFileStore(folder);
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe.each<[string, () => Promise<FileStore>]>([
  ["FileSystemFileStore", fileSystemStore],
  ["InMemoryFileStore", () => Promise.resolve(new InMemoryFileStore())],
])("FileStore contract: %s", (_name, create) => {
  it("gives back exactly what was put", async () => {
    const store = await create();
    await store.put("receipts/r1/i1.jpg", bytes("first image"));
    expect(await store.get("receipts/r1/i1.jpg")).toEqual(bytes("first image"));
  });

  it("replaces a file put twice at the same key", async () => {
    const store = await create();
    await store.put("a/b.jpg", bytes("old"));
    await store.put("a/b.jpg", bytes("new"));
    expect(await store.get("a/b.jpg")).toEqual(bytes("new"));
  });

  it("returns undefined for a missing key, and deleting one is harmless", async () => {
    const store = await create();
    expect(await store.get("receipts/none.jpg")).toBeUndefined();
    await store.delete("receipts/none.jpg");
  });

  it("deletes", async () => {
    const store = await create();
    await store.put("x/y.jpg", bytes("data"));
    await store.delete("x/y.jpg");
    expect(await store.get("x/y.jpg")).toBeUndefined();
  });

  it("refuses keys that could leave the store or aren't in the key format", async () => {
    const store = await create();
    for (const key of ["../escape.jpg", "a/../../b", "/absolute", "a//b", "", "UPPER.jpg", "a/./b", "a\\b"]) {
      await expect(store.put(key, bytes("x"))).rejects.toThrow(/Invalid file key/);
      await expect(store.get(key)).rejects.toThrow(/Invalid file key/);
    }
  });

  it("does not hand back a copy that changes when the caller's buffer does", async () => {
    const store = await create();
    const data = bytes("abc");
    await store.put("k.jpg", data);
    data[0] = 0;
    expect(await store.get("k.jpg")).toEqual(bytes("abc"));
  });
});

describe("FileSystemFileStore", () => {
  it("leaves no partial files behind", async () => {
    const folder = await mkdtemp(join(tmpdir(), "snaptrack-files-"));
    folders.push(folder);
    const store = new FileSystemFileStore(folder);
    await store.put("receipts/r1/i1.jpg", bytes("data"));
    expect(await readdir(join(folder, "receipts", "r1"))).toEqual(["i1.jpg"]);
  });
});
