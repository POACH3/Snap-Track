CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`level` integer NOT NULL,
	`parent_id` text,
	`color` text,
	`sort_order` integer NOT NULL,
	`archived` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "categories_level_check" CHECK("categories"."level" between 1 and 4),
	CONSTRAINT "categories_parent_check" CHECK(("categories"."level" = 1) = ("categories"."parent_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_parent_name_unique` ON `categories` (`parent_id`,"name" collate nocase);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_top_name_unique` ON `categories` ("name" collate nocase) WHERE "categories"."parent_id" is null;--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `item_tags_tag_idx` ON `item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`archived` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` ("name" collate nocase);--> statement-breakpoint
CREATE TABLE `line_item_tags` (
	`line_item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`line_item_id`, `tag_id`),
	FOREIGN KEY (`line_item_id`) REFERENCES `line_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `line_item_tags_tag_idx` ON `line_item_tags` (`tag_id`);--> statement-breakpoint
ALTER TABLE `items` ADD `category_id` text REFERENCES categories(id);--> statement-breakpoint
ALTER TABLE `stores` ADD `default_category_id` text REFERENCES categories(id);--> statement-breakpoint
ALTER TABLE `line_items` ADD `line_category_id` text;--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggested_category_id` text;--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggested_tag_ids` text;--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggestion_outcome` text;--> statement-breakpoint
CREATE INDEX `line_items_line_category_idx` ON `line_items` (`line_category_id`);--> statement-breakpoint
-- The default L1 categories (SPEC.md §5). The household can rename or remove any of them.
INSERT INTO `categories` (`id`, `name`, `level`, `parent_id`, `color`, `sort_order`, `archived`, `created_at`, `updated_at`) VALUES
	('c93f957e-c916-4a16-8ca0-5fc9bf4a9838', 'Groceries', 1, NULL, NULL, 0, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('bd3c8cd1-fedd-4825-8ac5-bbde6d988df0', 'Dining', 1, NULL, NULL, 1, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('74309762-1fac-4dae-b565-25ff68ba1fde', 'Household', 1, NULL, NULL, 2, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('538cba12-cc37-4b89-8839-6fae79001fb7', 'Personal Care', 1, NULL, NULL, 3, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('1da25d24-2bfe-43e7-894c-e20db8388530', 'Health', 1, NULL, NULL, 4, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('881e4eb8-f163-4759-bae2-fe1d6c9c984c', 'Transportation', 1, NULL, NULL, 5, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('5c24f822-bdbd-4c6e-bafd-900d801f2141', 'Entertainment', 1, NULL, NULL, 6, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('ae77a0e8-fa81-4d42-a049-40c092e20149', 'Clothing', 1, NULL, NULL, 7, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('4c020fd0-d297-4924-ad32-0a7d5fc3ad81', 'Kids', 1, NULL, NULL, 8, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('79b3306f-af60-4831-afe9-dc053bc8174d', 'Pets', 1, NULL, NULL, 9, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('4abb231c-f28e-4e95-91e4-380ff8d9308f', 'Gifts', 1, NULL, NULL, 10, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
	('1b1ba434-a57c-4fe5-b650-dcb37ec219f0', 'Other', 1, NULL, NULL, 11, 0, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z');
