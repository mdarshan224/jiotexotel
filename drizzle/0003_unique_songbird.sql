CREATE TABLE `SupportCall` (
	`id` text PRIMARY KEY NOT NULL,
	`customerId` text NOT NULL,
	`callerUserId` text NOT NULL,
	`teamPhoneHash` text NOT NULL,
	`teamPhoneLast4` text NOT NULL,
	`attemptKey` text NOT NULL,
	`gatewaySid` text,
	`status` text DEFAULT 'CREATING' NOT NULL,
	`duration` integer,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`callerUserId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `SupportCall_attemptKey_unique` ON `SupportCall` (`attemptKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `SupportCall_gatewaySid_unique` ON `SupportCall` (`gatewaySid`);--> statement-breakpoint
CREATE INDEX `SupportCall_customerId_createdAt_idx` ON `SupportCall` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `SupportCall_callerUserId_createdAt_idx` ON `SupportCall` (`callerUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `SupportCall_teamPhoneHash_createdAt_idx` ON `SupportCall` (`teamPhoneHash`,`createdAt`);