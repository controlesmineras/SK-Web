CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_person_start` ON `events` (`person_id`,`start`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Disponible' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_document_unique` ON `people` (`document`);