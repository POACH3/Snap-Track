import type { ExtractedReceipt } from "@snaptrack/contracts";
import type { ExtractionJob } from "./job.ts";
import { parseModelOutput } from "./output.ts";
import type { ExtractorReply, WaitReason } from "./reply.ts";

/** Real failures allowed before giving up (SPEC.md §6.3 step 6). */
export const MAX_ATTEMPTS = 5;
/** An invalid reply is retried once (SPEC.md §6.3 step 3). */
export const MAX_INVALID_OUTPUTS = 2;

const MINUTE = 60_000;
/** Wait after the Nth real failure: 1, 2, 4, 8 minutes. */
export const retryDelayMs = (attempts: number) => MINUTE * 2 ** (attempts - 1);

/** How long to wait when the relay doesn't suggest a time. */
const DEFAULT_WAIT_MS: Record<WaitReason, number> = {
  busy: 30_000,
  reserved: 5 * MINUTE,
  offline: 2 * MINUTE,
  interrupted: 30_000,
  cancelled: 0,
};
/** A suggested wait is kept within these bounds, so a bad header can't stall or hammer. */
const MIN_WAIT_MS = 5_000;
const MAX_WAIT_MS = 60 * MINUTE;

export type Outcome =
  /** Valid output: save it (the receipts module decides unreviewed or review required). */
  | { kind: "save"; extracted: ExtractedReceipt; rawOutput: string; model: string | null }
  /** Not now: back to pending, no attempt counted. */
  | { kind: "wait"; nextAttemptAt: Date; note: string }
  /** A real failure with attempts left. */
  | {
      kind: "retry";
      attempts: number;
      invalidOutputs: number;
      nextAttemptAt: Date;
      lastError: string;
      rawOutput: string | null;
    }
  /** Out of attempts, or a second invalid reply: a person enters the data (`review_required`). */
  | {
      kind: "give-up";
      attempts: number;
      invalidOutputs: number;
      lastError: string;
      rawOutput: string | null;
    };

function waitUntil(now: Date, reason: WaitReason, retryAfterMs: number | null): Date {
  if (reason === "cancelled") return now;
  const wanted = retryAfterMs ?? DEFAULT_WAIT_MS[reason];
  return new Date(now.getTime() + Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, wanted)));
}

function failure(
  job: ExtractionJob,
  now: Date,
  lastError: string,
  invalid: boolean,
  rawOutput: string | null,
): Outcome {
  const attempts = job.attempts + 1;
  const invalidOutputs = job.invalidOutputs + (invalid ? 1 : 0);
  if (attempts >= MAX_ATTEMPTS || invalidOutputs >= MAX_INVALID_OUTPUTS) {
    return { kind: "give-up", attempts, invalidOutputs, lastError, rawOutput };
  }
  return {
    kind: "retry",
    attempts,
    invalidOutputs,
    nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
    lastError,
    rawOutput,
  };
}

/** What happens to a job after one request to the LLM server. The one place these rules live. */
export function decideOutcome(job: ExtractionJob, reply: ExtractorReply, now: Date): Outcome {
  switch (reply.kind) {
    case "wait":
      return {
        kind: "wait",
        nextAttemptAt: waitUntil(now, reply.reason, reply.retryAfterMs),
        note: reply.reason,
      };
    case "failure":
      return failure(job, now, reply.message, false, null);
    case "output": {
      const extracted = parseModelOutput(reply.content);
      if (extracted === undefined)
        return failure(job, now, "The model's reply wasn't valid JSON.", true, reply.content);
      return { kind: "save", extracted, rawOutput: reply.content, model: reply.model };
    }
  }
}
