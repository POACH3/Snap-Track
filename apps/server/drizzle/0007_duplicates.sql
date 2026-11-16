CREATE TABLE `duplicate_dismissals` (
	`receipt_id` text NOT NULL,
	`other_receipt_id` text NOT NULL,
	`dismissed_by_user_id` text NOT NULL,
	`dismissed_at` text NOT NULL,
	PRIMARY KEY(`receipt_id`, `other_receipt_id`),
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`other_receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `duplicate_dismissals_other_idx` ON `duplicate_dismissals` (`other_receipt_id`);