CREATE TABLE `AgentKyc` (
	`id` text PRIMARY KEY NOT NULL,
	`agentId` text NOT NULL,
	`verificationId` text NOT NULL,
	`templateName` text NOT NULL,
	`providerStatus` text DEFAULT 'CREATING' NOT NULL,
	`reviewStatus` text DEFAULT 'PENDING' NOT NULL,
	`formLink` text,
	`expiresAt` text NOT NULL,
	`consentAt` text NOT NULL,
	`checksJson` text DEFAULT '[]' NOT NULL,
	`reviewedBy` text,
	`reviewedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `AgentKyc_agentId_unique` ON `AgentKyc` (`agentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `AgentKyc_verificationId_unique` ON `AgentKyc` (`verificationId`);--> statement-breakpoint
CREATE TABLE `PickupEarning` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`agentId` text NOT NULL,
	`grossPaise` integer NOT NULL,
	`agentPaise` integer NOT NULL,
	`companyGrossPaise` integer NOT NULL,
	`serviceFeePaise` integer NOT NULL,
	`gstPaise` integer NOT NULL,
	`cgstPaise` integer NOT NULL,
	`sgstPaise` integer NOT NULL,
	`igstPaise` integer NOT NULL,
	`gstRate` real NOT NULL,
	`policy` text DEFAULT '65_35_GST_INCLUDED_V1' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `PickupEarning_orderId_unique` ON `PickupEarning` (`orderId`);--> statement-breakpoint
CREATE INDEX `PickupEarning_agentId_createdAt` ON `PickupEarning` (`agentId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `Agent` ADD `kycRequired` integer DEFAULT false NOT NULL;