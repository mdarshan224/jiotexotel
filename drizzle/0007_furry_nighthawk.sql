CREATE TABLE `PickupGate` (
	`orderId` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`arrivedAt` text NOT NULL,
	`verifiedAt` text,
	`verifiedAgentId` text,
	`failedAttempts` integer DEFAULT 0 NOT NULL,
	`lockedUntil` text,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `TrackingRoute` (
	`orderId` text PRIMARY KEY NOT NULL,
	`agentId` text NOT NULL,
	`sourceLat` real NOT NULL,
	`sourceLng` real NOT NULL,
	`encodedPolyline` text NOT NULL,
	`durationSeconds` integer NOT NULL,
	`distanceMeters` integer NOT NULL,
	`computedAt` text NOT NULL,
	`locationAt` text NOT NULL,
	`refreshClaimedAt` text,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `VoiceRoutingConfig` (
	`id` text PRIMARY KEY NOT NULL,
	`supportFallbackUserId` text,
	`flowUrl` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `Order` ADD `scheduledFor` text;--> statement-breakpoint
ALTER TABLE `Order` ADD `assignmentDeadlineAt` text;--> statement-breakpoint
ALTER TABLE `Order` ADD `assignmentTimedOutAt` text;--> statement-breakpoint
ALTER TABLE `Order` ADD `timeoutPolicyVersion` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `Order_assignment_deadline_idx` ON `Order` (`timeoutPolicyVersion`,`agentId`,`assignmentDeadlineAt`);