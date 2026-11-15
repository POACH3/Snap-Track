import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The persisted queue of receipts to read (SPEC.md §5, `extraction_jobs`). One job per receipt. */
export const extractionJobs = sqliteTable(
  "extraction_jobs",
  {
    id: text("id").primaryKey(),
    /** A `receipts` id. No foreign key: that table belongs to `receipts` (SPEC.md §3.1 rule 4). */
    receiptId: text("receipt_id").notNull().unique(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull(),
    /** Real failures only; waiting for the LLM server never counts. */
    attempts: integer("attempts").notNull().default(0),
    /** Replies that weren't valid JSON; the second one gives up (SPEC.md §6.3 step 3). */
    invalidOutputs: integer("invalid_outputs").notNull().default(0),
    lastError: text("last_error"),
    /** ISO 8601 UTC; a pending job runs once this has passed. */
    nextAttemptAt: text("next_attempt_at").notNull(),
    model: text("model"),
    /** The model's reply, kept for debugging and for re-processing later (e.g. by `catalog`). */
    rawOutput: text("raw_output"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("extraction_jobs_due_idx").on(table.status, table.nextAttemptAt),
    check("extraction_jobs_status_check", sql`${table.status} in ('pending', 'running', 'done', 'failed')`),
  ],
);
