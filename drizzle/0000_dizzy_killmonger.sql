CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`callsign` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`experience` integer DEFAULT 0 NOT NULL,
	`kills` integer DEFAULT 0 NOT NULL,
	`deaths` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`matches_played` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
