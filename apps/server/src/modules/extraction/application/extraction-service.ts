import type { Clock, Id, Transaction } from "@snaptrack/core";
import { decideOutcome } from "../domain/outcome.ts";
import type { ExtractorReply } from "../domain/reply.ts";
import type { ExtractionJobRepository, ReceiptExtractor, ReceiptsGateway } from "../ports.ts";

export interface ExtractionDeps {
  jobs: ExtractionJobRepository;
  extractor: ReceiptExtractor;
  receipts: ReceiptsGateway;
  clock: Clock;
  transaction: Transaction;
}

export type ExtractionService = ReturnType<typeof createExtractionService>;

export function createExtractionService(deps: ExtractionDeps) {
  async function ask(images: readonly Uint8Array[], signal: AbortSignal): Promise<ExtractorReply> {
    if (signal.aborted) return { kind: "wait", reason: "cancelled", retryAfterMs: null };
    try {
      return await deps.extractor.extract(images, signal);
    } catch (error) {
      // The adapter answers expected cases itself; anything thrown is unexpected, so it counts.
      return { kind: "failure", message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    /** Queues a new receipt. Called inside the upload's transaction (`ReceiptUploadedListener`). */
    enqueue(receiptId: Id): void {
      deps.jobs.insertPending(receiptId, deps.clock.now());
    },

    /** At startup: jobs a crash or stop left running go back in the queue, attempts unchanged. */
    recoverInterrupted(): number {
      return deps.transaction.run(() => {
        const receiptIds = deps.jobs.resetRunning(deps.clock.now());
        for (const receiptId of receiptIds) deps.receipts.setExtractionStatus(receiptId, "uploaded");
        return receiptIds.length;
      });
    },

    nextDueAt(): Date | undefined {
      return deps.jobs.nextDueAt();
    },

    /**
     * Reads the oldest due receipt, if any (SPEC.md §6.3.1, SnapTrack's side). One at a time:
     * the caller waits for this before running the next.
     */
    async runNextJob(signal: AbortSignal): Promise<"idle" | "worked"> {
      const job = deps.transaction.run(() => {
        const claimed = deps.jobs.claimNextDue(deps.clock.now());
        if (claimed !== undefined) deps.receipts.setExtractionStatus(claimed.receiptId, "extracting");
        return claimed;
      });
      if (job === undefined) return "idle";

      const images = await deps.receipts.imagesForExtraction(job.receiptId);
      if (images === undefined) {
        deps.transaction.run(() => {
          deps.jobs.markFailed(
            job.id,
            {
              attempts: job.attempts,
              invalidOutputs: job.invalidOutputs,
              lastError: "The receipt's photos are gone.",
              rawOutput: null,
            },
            deps.clock.now(),
          );
          deps.receipts.markReviewRequired(job.receiptId);
        });
        return "worked";
      }

      const reply = await ask(images, signal);
      const now = deps.clock.now();
      const outcome = decideOutcome(job, reply, now);
      deps.transaction.run(() => {
        switch (outcome.kind) {
          case "save":
            deps.receipts.saveExtraction(job.receiptId, outcome.extracted);
            deps.jobs.markDone(job.id, { model: outcome.model, rawOutput: outcome.rawOutput }, now);
            break;
          case "wait":
            deps.jobs.reschedule(job.id, outcome.nextAttemptAt, undefined, now);
            deps.receipts.setExtractionStatus(job.receiptId, "uploaded");
            break;
          case "retry":
            deps.jobs.reschedule(job.id, outcome.nextAttemptAt, outcome, now);
            deps.receipts.setExtractionStatus(job.receiptId, "uploaded");
            break;
          case "give-up":
            deps.jobs.markFailed(job.id, outcome, now);
            deps.receipts.markReviewRequired(job.receiptId);
            break;
        }
      });
      return "worked";
    },
  };
}
