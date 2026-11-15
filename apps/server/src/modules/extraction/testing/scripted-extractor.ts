import type { ExtractorReply } from "../domain/reply.ts";
import type { ReceiptExtractor } from "../ports.ts";

/**
 * Plays back replies in order, and records what it was asked. Stands in for the LLM server in
 * use-case tests. The relay adapter itself is tested against a stub HTTP server with recorded
 * replies (relay-extractor.test.ts), since a scripted fake has no behavior of its own to match.
 */
export class ScriptedExtractor implements ReceiptExtractor {
  readonly requests: (readonly Uint8Array[])[] = [];
  readonly #replies: ExtractorReply[];

  constructor(replies: ExtractorReply[] = []) {
    this.#replies = [...replies];
  }

  /** Adds replies to play after the current ones. */
  then(...replies: ExtractorReply[]): this {
    this.#replies.push(...replies);
    return this;
  }

  extract(images: readonly Uint8Array[]): Promise<ExtractorReply> {
    this.requests.push(images);
    const reply = this.#replies.shift();
    if (reply === undefined) throw new Error("ScriptedExtractor: no reply left for this request");
    return Promise.resolve(reply);
  }
}

/** A model reply with the given JSON. */
export const output = (json: unknown, model = "Qwen3.6-35B-A3B-4bit"): ExtractorReply => ({
  kind: "output",
  content: JSON.stringify(json),
  model,
});
