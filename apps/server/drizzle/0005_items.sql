CREATE TABLE `item_identifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`display_value` text NOT NULL,
	`item_id` text NOT NULL,
	`state` text NOT NULL,
	`first_receipt_id` text,
	`times_seen` integer NOT NULL,
	`last_seen_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "item_identifiers_type_check" CHECK("item_identifiers"."type" in ('barcode', 'code', 'name')),
	CONSTRAINT "item_identifiers_state_check" CHECK("item_identifiers"."state" in ('active', 'ambiguous')),
	CONSTRAINT "item_identifiers_barcode_store_check" CHECK(("item_identifiers"."type" = 'barcode') = ("item_identifiers"."store_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_identifiers_store_type_value_unique` ON `item_identifiers` (`store_id`,`type`,`value`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_identifiers_barcode_unique` ON `item_identifiers` (`type`,`value`) WHERE "item_identifiers"."store_id" is null;--> statement-breakpoint
CREATE INDEX `item_identifiers_item_idx` ON `item_identifiers` (`item_id`);--> statement-breakpoint
CREATE INDEX `item_identifiers_value_idx` ON `item_identifiers` (`value`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "items_name_source_check" CHECK("items"."name_source" in ('printed', 'model', 'user'))
);
--> statement-breakpoint
CREATE INDEX `items_name_idx` ON `items` ("name" collate nocase);--> statement-breakpoint
ALTER TABLE `line_items` ADD `item_id` text;--> statement-breakpoint
CREATE INDEX `line_items_item_idx` ON `line_items` (`item_id`);