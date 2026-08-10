CREATE TABLE `player_match_results` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`match_id` text NOT NULL,
	`kills` integer NOT NULL,
	`deaths` integer NOT NULL,
	`won` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
