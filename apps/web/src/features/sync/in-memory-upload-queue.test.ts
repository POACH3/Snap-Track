import { describe, expect, it, vi } from "vitest";
import { InMemoryUploadQueue } from "./in-memory-upload-queue.ts";

const receipt = (id: string) => ({ id, capturedAt: "2026-11-15T10:00:00.000Z", images: [new Blob(["x"])] });

describe("InMemoryUploadQueue", () => {
  it("keeps receipts oldest first, waiting, and ignores a second add of the same id", () => {
    const queue = new InMemoryUploadQueue();
    queue.add(receipt("a"));
    queue.add(receipt("b"));
    queue.add(receipt("a"));
    expect(queue.entries().map((e) => [e.receipt.id, e.state])).toEqual([
      ["a", "waiting"],
      ["b", "waiting"],
    ]);
  });

  it("changes state and removes", () => {
    const queue = new InMemoryUploadQueue();
    queue.add(receipt("a"));
    queue.setState("a", "failed");
    expect(queue.entries()[0]?.state).toBe("failed");
    queue.remove("a");
    expect(queue.entries()).toEqual([]);
  });

  it("tells subscribers about each change and returns the same array until something changes", () => {
    const queue = new InMemoryUploadQueue();
    const listener = vi.fn();
    const stop = queue.subscribe(listener);
    const before = queue.entries();
    expect(queue.entries()).toBe(before);
    queue.add(receipt("a"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(queue.entries()).not.toBe(before);
    stop();
    queue.remove("a");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
