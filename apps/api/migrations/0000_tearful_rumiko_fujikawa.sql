CREATE TABLE `block_items` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`position` integer NOT NULL,
	`exercise_slug` text NOT NULL,
	`duration_sec` integer,
	`reps` text,
	`side` text,
	`switch_noun` text,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_slug`) REFERENCES `exercises`(`slug`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `block_items_block_position_idx` ON `block_items` (`block_id`,`position`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`rounds` integer,
	`work_sec` integer,
	`rest_sec` integer,
	`interval_sec` integer,
	`estimated_sec_per_item` integer,
	`prep_sec` integer,
	`prep_hint` text,
	`tasks` text,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_section_position_idx` ON `blocks` (`section_id`,`position`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`default_dose` text NOT NULL,
	`equipment` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`phase` text NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sections_workout_position_idx` ON `sections` (`workout_id`,`position`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workout_id` text,
	`workout_name` text NOT NULL,
	`client_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	`active_seconds` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_sessions_user_client_idx` ON `workout_sessions` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_user_completed_idx` ON `workout_sessions` (`user_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`organization_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_template` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workouts_owner_idx` ON `workouts` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
