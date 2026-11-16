import type { Clock, Id, Transaction } from "@snaptrack/core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createExtractionService } from "../application/extraction-service.ts";
import type { LabelSource, ReceiptExtractor, ReceiptsGateway } from "../ports.ts";
import { ExtractionWorker, type WorkerLog } from "./extraction-worker.ts";
import { SqliteJobRepository } from "./sqlite-job-repository.ts";

export interface ExtractionModuleOptions {
  db: BetterSQLite3Database;
  clock: Clock;
  transaction: Transaction;
  extractor: ReceiptExtractor;
  receipts: ReceiptsGateway;
  /** The categories and tags the model may suggest; supplied by `catalog`. */
  labels: LabelSource;
  log: WorkerLog;
}

/** Wires the extraction module's adapters to its ports. Called from a composition root. */
export function createExtractionModule(options: ExtractionModuleOptions) {
  const jobs = new SqliteJobRepository(options.db);
  const service = createExtractionService({
    jobs,
    extractor: options.extractor,
    receipts: options.receipts,
    labels: options.labels,
    clock: options.clock,
    transaction: options.transaction,
  });
  const worker = new ExtractionWorker(service, options.log, () => options.clock.now().getTime());
  return {
    service,
    jobs,
    worker,
    /** For the receipts module: queue each new receipt in its upload transaction, then wake the worker. */
    uploadedListener: {
      receiptUploaded(receiptId: Id): void {
        service.enqueue(receiptId);
        // The worker runs after this transaction commits: waking only resolves a timer.
        worker.wake();
      },
    },
    /** For the receipts module: a deleted receipt's job is deleted in the same transaction. */
    deletedListener: {
      receiptDeleted(receiptId: Id): void {
        jobs.deleteForReceipt(receiptId);
      },
    },
  };
}
