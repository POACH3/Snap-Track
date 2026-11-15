CREATE TABLE `receipt_images` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`position` integer NOT NULL,
	`image_key` text,
	`thumbnail_key` text,
	`image_sha256` text NOT NULL,
	`image_deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_images_receipt_position_unique` ON `receipt_images` (`receipt_id`,`position`);--> statement-breakpoint
CREATE INDEX `receipt_images_sha256_idx` ON `receipt_images` (`image_sha256`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`logged_by_user_id` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`captured_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "receipts_source_check" CHECK("receipts"."source" in ('photo', 'manual', 'import')),
	CONSTRAINT "receipts_status_check" CHECK("receipts"."status" in ('uploaded', 'extracting', 'unreviewed', 'review_required', 'confirmed'))
);
--> statement-breakpoint
CREATE INDEX `receipts_captured_at_id_idx` ON `receipts` (`captured_at`,`id`);