CREATE TABLE `extraction_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`invalid_outputs` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` text NOT NULL,
	`model` text,
	`raw_output` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "extraction_jobs_status_check" CHECK("extraction_jobs"."status" in ('pending', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `extraction_jobs_receipt_id_unique` ON `extraction_jobs` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `extraction_jobs_due_idx` ON `extraction_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`raw_name` text,
	`item_code` text,
	`quantity_milli` integer NOT NULL,
	`unit` text NOT NULL,
	`unit_price_cents` integer,
	`line_total_cents` integer,
	`discount_cents` integer,
	`tax_code` text,
	`suggested_item_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "line_items_kind_check" CHECK("line_items"."kind" in ('item', 'fee'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_items_receipt_position_unique` ON `line_items` (`receipt_id`,`position`);--> statement-breakpoint
ALTER TABLE `receipts` ADD `purchased_at` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `subtotal_cents` integer;--> statement-breakpoint
ALTER TABLE `receipts` ADD `discount_cents` integer;--> statement-breakpoint
ALTER TABLE `receipts` ADD `tax_cents` integer;--> statement-breakpoint
ALTER TABLE `receipts` ADD `tip_cents` integer;--> statement-breakpoint
ALTER TABLE `receipts` ADD `total_cents` integer;--> statement-breakpoint
ALTER TABLE `receipts` ADD `printed_savings_cents` integer;--> statement-breakpoint
ALTER TABLE `receipts` ADD `printed_item_count` integer;--> statement-breakpoint
ALTER TABLE `receipts` ADD `tax_lines` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `payments` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `transaction_numbers` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `raw_text` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `store_evidence` text;--> statement-breakpoint
-- Receipts uploaded before extraction existed (Stage 2) get a job, so they are read too.
INSERT INTO `extraction_jobs` (`id`, `receipt_id`, `status`, `attempts`, `invalid_outputs`, `next_attempt_at`, `created_at`, `updated_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
		|| substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	`id`, 'pending', 0, 0,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `receipts`
WHERE `status` = 'uploaded';
