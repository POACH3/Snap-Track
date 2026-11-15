import type { ExtractedReceipt } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";
import type { ExtractionJob } from "./domain/job.ts";
import type { ExtractorReply } from "./domain/reply.ts";

/**
 * Reads one receipt with the vision model (SPEC.md §6.3). Answers every expected situation
 * (output, wait, failure) as a reply rather than an exception. Replacing the LLM server means one
 * new adapter (SPEC.md §3.1 rule 6).
 */
export interface ReceiptExtractor {
  /** `images` are the receipt's photos in order, top first; all go in one request. */
  extract(images: readonly Uint8Array[], signal: AbortSignal): Promise<ExtractorReply>;
}

export interface JobFailure {
  attempts: number;
  invalidOutputs: number;
  lastError: string;
  rawOutput: string | null;
}

/** The persisted queue (SPEC.md §5, `extraction_jobs`). Synchronous (SPEC.md §3.1 rule 7). */
export interface ExtractionJobRepository {
  /** Queues a receipt. Does nothing if it already has a job. */
  insertPending(receiptId: Id, now: Date): void;
  /** Marks the oldest due pending job running and returns it. */
  claimNextDue(now: Date): ExtractionJob | undefined;
  markDone(id: Id, result: { model: string | null; rawOutput: string }, now: Date): void;
  /** Back to pending; `failure` is set only when this counts as a failed attempt. */
  reschedule(id: Id, nextAttemptAt: Date, failure: JobFailure | undefined, now: Date): void;
  markFailed(id: Id, failure: JobFailure, now: Date): void;
  /** Puts jobs left running (by a crash or a stop) back to pending; returns their receipt ids. */
  resetRunning(now: Date): Id[];
  /** When the earliest pending job is due, if any. */
  nextDueAt(): Date | undefined;
  findByReceipt(
    receiptId: Id,
  ): (ExtractionJob & { lastError: string | null; rawOutput: string | null }) | undefined;
}

/** What extraction needs from `receipts`, supplied by the composition root from the receipts module. */
export interface ReceiptsGateway {
  imagesForExtraction(receiptId: Id): Promise<Uint8Array[] | undefined>;
  setExtractionStatus(receiptId: Id, status: "extracting" | "uploaded"): void;
  saveExtraction(receiptId: Id, extracted: ExtractedReceipt): "unreviewed" | "review_required";
  markReviewRequired(receiptId: Id): void;
}
