import type { ExtractorReply } from "../domain/reply.ts";
import type { ReceiptExtractor } from "../ports.ts";
import { SYSTEM_PROMPT, userText } from "./prompt.ts";

export interface RelayExtractorOptions {
  /** The relay, e.g. `http://127.0.0.1:8081` (`LLM_SERVER_URL`). */
  baseUrl: string;
  /** SnapTrack's own oMLX sub-key (`LLM_SERVER_API_KEY`). */
  apiKey: string;
  /** As the LLM server lists it (`EXTRACTION_MODEL`). */
  model: string;
  /** Longest to wait for one receipt (`EXTRACTION_TIMEOUT_MS`). */
  timeoutMs: number;
  /** Replaceable in tests. */
  fetch?: typeof fetch;
}

/** Longest reply allowed, so a model that rambles stops (and frees the server) instead of running on. */
const MAX_TOKENS = 8000;

/**
 * Sends a receipt to the LLM server's relay as one low-priority chat request (SPEC.md §6.3.1;
 * contract in docs/feature-plans/extraction-plan.md). The relay decides when it runs; this adapter
 * only maps its replies.
 */
export class RelayExtractor implements ReceiptExtractor {
  readonly #options: RelayExtractorOptions;
  readonly #fetch: typeof fetch;

  constructor(options: RelayExtractorOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async extract(images: readonly Uint8Array[], signal: AbortSignal): Promise<ExtractorReply> {
    const timeout = AbortSignal.timeout(this.#options.timeoutMs);
    const both = AbortSignal.any([signal, timeout]);
    // Why a request didn't finish: SnapTrack stopping, the time limit, or no LLM server.
    const unfinished = (): ExtractorReply =>
      signal.aborted
        ? { kind: "wait", reason: "cancelled", retryAfterMs: null }
        : timeout.aborted
          ? { kind: "failure", message: `No answer within ${this.#options.timeoutMs / 1000} s.` }
          : { kind: "wait", reason: "offline", retryAfterMs: null };

    let response: Response;
    let text: string;
    try {
      response = await this.#fetch(`${this.#options.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.#options.apiKey}`,
          // The relay runs low-priority requests only when no one is chatting.
          "x-llm-priority": "low",
          // The relay's usage log names the caller from this header.
          "x-openwebui-user-name": "snaptrack",
        },
        body: JSON.stringify(this.#request(images)),
        signal: both,
      });
      text = await response.text();
    } catch {
      return unfinished();
    }
    return mapReply(response.status, response.headers.get("retry-after"), text);
  }

  #request(images: readonly Uint8Array[]) {
    return {
      model: this.#options.model,
      stream: false,
      // Overrides the server's chat defaults: extraction wants the most likely reading, no thinking.
      temperature: 0,
      presence_penalty: 0,
      max_tokens: MAX_TOKENS,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText(images.length) },
            ...images.map((bytes) => ({
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}` },
            })),
          ],
        },
      ],
    };
  }
}

/** `Retry-After` in milliseconds: seconds, or an HTTP date. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (header === null || header.trim() === "") return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

const snippet = (text: string) => text.trim().slice(0, 200);

function errorCode(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = body.error;
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text.trim()) as unknown;
  } catch {
    return undefined;
  }
}

/** One relay reply as an extractor reply (the table in docs/feature-plans/extraction-plan.md). */
export function mapReply(status: number, retryAfter: string | null, text: string): ExtractorReply {
  if (status === 502) return { kind: "wait", reason: "offline", retryAfterMs: retryAfterMs(retryAfter) };
  const body = parse(text);
  if (status === 503) {
    const code = errorCode(body);
    if (code === "server_reserved")
      return { kind: "wait", reason: "reserved", retryAfterMs: retryAfterMs(retryAfter) };
    if (code === "low_priority_busy")
      return { kind: "wait", reason: "busy", retryAfterMs: retryAfterMs(retryAfter) };
  }
  if (status !== 200)
    return { kind: "failure", message: `The LLM server answered ${status}: ${snippet(text)}` };

  // oMLX commits to 200 after 2 s (sending spaces to keep the line open), so a failure after that
  // arrives as a 200 whose body is an error and has no choices.
  const choices = typeof body === "object" && body !== null && "choices" in body ? body.choices : undefined;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message =
    typeof first === "object" && first !== null && "message" in first ? first.message : undefined;
  const content =
    typeof message === "object" && message !== null && "content" in message ? message.content : undefined;
  if (typeof content !== "string") {
    return { kind: "failure", message: `The LLM server's reply had no answer: ${snippet(text)}` };
  }
  const model =
    typeof body === "object" && body !== null && "model" in body && typeof body.model === "string"
      ? body.model
      : null;
  return { kind: "output", content, model };
}
