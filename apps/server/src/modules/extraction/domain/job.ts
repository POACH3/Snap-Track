import type { Id } from "@snaptrack/core";

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface ExtractionJob {
  readonly id: Id;
  readonly receiptId: Id;
  readonly status: JobStatus;
  /** Real failures so far; waiting never counts. */
  readonly attempts: number;
  /** Replies so far that weren't valid JSON. */
  readonly invalidOutputs: number;
  /** ISO 8601 UTC. */
  readonly nextAttemptAt: string;
}
