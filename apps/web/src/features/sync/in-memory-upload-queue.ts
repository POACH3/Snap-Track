import type { QueueEntry, QueuedReceipt, UploadQueue, UploadState } from "./upload-queue.ts";

/** Keeps the queue in memory: lost when the app closes (Stage 5 makes it durable). */
export class InMemoryUploadQueue implements UploadQueue {
  #entries: readonly QueueEntry[] = [];
  readonly #listeners = new Set<() => void>();

  add(receipt: QueuedReceipt): void {
    if (this.#entries.some((entry) => entry.receipt.id === receipt.id)) return;
    this.#update([...this.#entries, { receipt, state: "waiting" }]);
  }

  setState(id: string, state: UploadState): void {
    this.#update(this.#entries.map((entry) => (entry.receipt.id === id ? { ...entry, state } : entry)));
  }

  remove(id: string): void {
    this.#update(this.#entries.filter((entry) => entry.receipt.id !== id));
  }

  entries(): readonly QueueEntry[] {
    return this.#entries;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #update(entries: readonly QueueEntry[]): void {
    this.#entries = entries;
    for (const listener of this.#listeners) listener();
  }
}
