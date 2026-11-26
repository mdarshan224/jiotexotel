CREATE TABLE `OrderWeightAdjustment` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`bookedPaise` integer NOT NULL,
	`actualPaise` integer NOT NULL,
	`extraPaise` integer DEFAULT 0 NOT NULL,
	`refundPaise` integer DEFAULT 0 NOT NULL,
	`weightsJson` text NOT NULL,
	`weightsHash` text NOT NULL,
	`status` text DEFAULT 'READY' NOT NULL,
	`qrId` text,
	`qrImageUrl` text,
	`qrExpiresAt` text,
	`gatewayOrderId` text,
	`providerPaymentId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `OrderWeightAdjustment_orderId_unique` ON `OrderWeightAdjustment` (`orderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `OrderWeightAdjustment_qrId_unique` ON `OrderWeightAdjustment` (`qrId`);--> statement-breakpoint
CREATE UNIQUE INDEX `OrderWeightAdjustment_gatewayOrderId_unique` ON `OrderWeightAdjustment` (`gatewayOrderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `OrderWeightAdjustment_providerPaymentId_unique` ON `OrderWeightAdjustment` (`providerPaymentId`);--> statement-breakpoint
ALTER TABLE `AgentKyc` ADD `flowVersion` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `AgentKyc` ADD `evidenceJson` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `AgentKyc` ADD `profileJson` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `AgentKyc` ADD `issuesJson` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `AgentKyc` ADD `reviewReason` text;--> statement-breakpoint
ALTER TABLE `AgentKyc` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `RefundAttempt` ADD `destination` text DEFAULT 'WALLET' NOT NULL;--> statement-breakpoint
ALTER TABLE `RefundRequest` ADD `destination` text DEFAULT 'WALLET' NOT NULL;--> statement-breakpoint
ALTER TABLE `SubscriptionPayment` ADD `offerSnapshotJson` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `WalletTransaction` ADD `refundAllocationJson` text;
--> statement-breakpoint
UPDATE "RefundAttempt" SET "destination" = 'SOURCE' WHERE "razorpayRefundId" IS NOT NULL OR "status" IN ('REFUND_PROCESSING','REFUND_PENDING','REFUND_PENDING_RECONCILIATION','RECONCILIATION_REQUIRED');
--> statement-breakpoint
UPDATE "RefundRequest" SET "destination" = 'SOURCE' WHERE "razorpayRefundId" IS NOT NULL OR "status" IN ('REFUND_PROCESSING','REFUND_STATUS_UNKNOWN');

--> statement-breakpoint
ALTER TABLE "Payment" ADD "purpose" text DEFAULT 'BOOKING' NOT NULL;
