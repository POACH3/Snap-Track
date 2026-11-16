CREATE TABLE `store_identifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`display_value` text NOT NULL,
	`state` text NOT NULL,
	`first_receipt_id` text,
	`times_seen` integer NOT NULL,
	`last_seen_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_identifiers_type_check" CHECK("store_identifiers"."type" in ('name', 'legal_name', 'logo_text', 'phone', 'website', 'address')),
	CONSTRAINT "store_identifiers_state_check" CHECK("store_identifiers"."state" in ('active', 'ambiguous'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_identifiers_type_value_unique` ON `store_identifiers` (`type`,`value`);--> statement-breakpoint
CREATE INDEX `store_identifiers_store_idx` ON `store_identifiers` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_identifiers_value_idx` ON `store_identifiers` (`value`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_name_unique` ON `stores` ("name" collate nocase);--> statement-breakpoint
ALTER TABLE `receipts` ADD `store_id` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `store_matched_by` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `store_match` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `note` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `confirmed_by_user_id` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `confirmed_at` text;--> statement-breakpoint
CREATE INDEX `receipts_store_idx` ON `receipts` (`store_id`);