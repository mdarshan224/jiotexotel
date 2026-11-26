CREATE TABLE `VoiceCall` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`callerUserId` text NOT NULL,
	`attemptKey` text NOT NULL,
	`gatewaySid` text,
	`status` text DEFAULT 'CREATING' NOT NULL,
	`duration` integer,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`callerUserId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `VoiceCall_attemptKey_unique` ON `VoiceCall` (`attemptKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `VoiceCall_gatewaySid_unique` ON `VoiceCall` (`gatewaySid`);--> statement-breakpoint
CREATE INDEX `VoiceCall_orderId_createdAt_idx` ON `VoiceCall` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `VoiceCall_callerUserId_createdAt_idx` ON `VoiceCall` (`callerUserId`,`createdAt`);