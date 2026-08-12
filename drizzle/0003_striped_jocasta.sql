CREATE TABLE `admin_roles` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `admin_roles` (`email`, `role`) VALUES ('sebastian.ward@pinecrest.edu', 'junior');
