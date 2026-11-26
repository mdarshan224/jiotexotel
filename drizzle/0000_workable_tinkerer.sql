CREATE TABLE `Address` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`label` text DEFAULT 'Home' NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`houseNo` text NOT NULL,
	`building` text,
	`street` text NOT NULL,
	`area` text NOT NULL,
	`landmark` text,
	`city` text DEFAULT 'Bengaluru' NOT NULL,
	`pincode` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`googlePlaceId` text,
	`pickupInstructions` text,
	`isDefault` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`formattedAddress` text,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `Admin` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`department` text DEFAULT 'Operations' NOT NULL,
	`accessLevel` text DEFAULT 'FULL' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Admin_userId_unique` ON `Admin` (`userId`);--> statement-breakpoint
CREATE TABLE `Agent` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`vehicleType` text DEFAULT 'Three-Wheeler Auto Loading' NOT NULL,
	`vehicleNumber` text DEFAULT 'KA-05-JK-1024' NOT NULL,
	`status` text DEFAULT 'OFFLINE' NOT NULL,
	`currentLat` real DEFAULT 12.9166 NOT NULL,
	`currentLng` real DEFAULT 77.5996 NOT NULL,
	`rating` real DEFAULT 4.9 NOT NULL,
	`serviceAreas` text DEFAULT 'JP Nagar, Jayanagar, Koramangala, Electronic City' NOT NULL,
	`tokenVersion` integer DEFAULT 1 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Agent_userId_unique` ON `Agent` (`userId`);--> statement-breakpoint
CREATE TABLE `AgentLocation` (
	`id` text PRIMARY KEY NOT NULL,
	`agentId` text NOT NULL,
	`orderId` text,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`speed` real DEFAULT 0,
	`timestamp` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `AgentLocation_agentId_orderId_timestamp_0` ON `AgentLocation` (`agentId`,`orderId`,`timestamp`);--> statement-breakpoint
CREATE TABLE `AgentWallet` (
	`id` text PRIMARY KEY NOT NULL,
	`agentId` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `AgentWallet_agentId_unique` ON `AgentWallet` (`agentId`);--> statement-breakpoint
CREATE TABLE `AgentWalletTransaction` (
	`id` text PRIMARY KEY NOT NULL,
	`walletId` text NOT NULL,
	`agentId` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`balanceAfter` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'SUCCESS' NOT NULL,
	`referenceId` text,
	`orderId` text,
	`reason` text,
	`adminId` text,
	`failureReason` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`walletId`) REFERENCES `AgentWallet`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `AgentWalletTransaction_referenceId_unique` ON `AgentWalletTransaction` (`referenceId`);--> statement-breakpoint
CREATE INDEX `AgentWalletTransaction_agentId_createdAt_0` ON `AgentWalletTransaction` (`agentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `AgentWalletTransaction_walletId_status_createdAt_1` ON `AgentWalletTransaction` (`walletId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `AgentWalletTransaction_type_status_createdAt_2` ON `AgentWalletTransaction` (`type`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `AgentWalletTransaction_orderId_3` ON `AgentWalletTransaction` (`orderId`);--> statement-breakpoint
CREATE TABLE `AuditLog` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`userName` text DEFAULT 'System' NOT NULL,
	`action` text NOT NULL,
	`oldValue` text,
	`newValue` text,
	`ipAddress` text DEFAULT '127.0.0.1',
	`timestamp` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `AuditLog_timestamp_0` ON `AuditLog` (`timestamp`);--> statement-breakpoint
CREATE INDEX `AuditLog_action_timestamp_1` ON `AuditLog` (`action`,`timestamp`);--> statement-breakpoint
CREATE TABLE `Complaint` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text,
	`customerId` text NOT NULL,
	`category` text DEFAULT 'WEIGHT_DISPUTE' NOT NULL,
	`description` text,
	`photoUrl` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`resolutionNotes` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `ContactEnquiry` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ContactEnquiry_status_createdAt_0` ON `ContactEnquiry` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `Coupon` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`discountType` text DEFAULT 'FLAT' NOT NULL,
	`discountValue` real DEFAULT 50 NOT NULL,
	`minOrderValue` real DEFAULT 100 NOT NULL,
	`maxDiscount` real DEFAULT 100,
	`active` integer DEFAULT true NOT NULL,
	`expiryDate` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Coupon_code_unique` ON `Coupon` (`code`);--> statement-breakpoint
CREATE INDEX `Coupon_active_expiryDate_0` ON `Coupon` (`active`,`expiryDate`);--> statement-breakpoint
CREATE TABLE `Customer` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`referralCode` text,
	`points` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Customer_userId_unique` ON `Customer` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `Customer_referralCode_unique` ON `Customer` (`referralCode`);--> statement-breakpoint
CREATE TABLE `CustomerSubscription` (
	`id` text PRIMARY KEY NOT NULL,
	`customerId` text NOT NULL,
	`offerId` text NOT NULL,
	`paymentId` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`startDate` text NOT NULL,
	`expiryDate` text NOT NULL,
	`pickupsAllowed` integer DEFAULT 4 NOT NULL,
	`pickupsUsed` integer DEFAULT 0 NOT NULL,
	`autoRenew` integer DEFAULT false NOT NULL,
	`cancelledAt` text,
	`cancellationReason` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offerId`) REFERENCES `SubscriptionOffer`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`paymentId`) REFERENCES `SubscriptionPayment`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `CustomerSubscription_paymentId_unique` ON `CustomerSubscription` (`paymentId`);--> statement-breakpoint
CREATE INDEX `CustomerSubscription_customerId_status_expiryDate_0` ON `CustomerSubscription` (`customerId`,`status`,`expiryDate`);--> statement-breakpoint
CREATE INDEX `CustomerSubscription_offerId_createdAt_1` ON `CustomerSubscription` (`offerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `CustomerSubscription_status_expiryDate_2` ON `CustomerSubscription` (`status`,`expiryDate`);--> statement-breakpoint
CREATE TABLE `CustomerWallet` (
	`id` text PRIMARY KEY NOT NULL,
	`customerId` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`balancePaise` integer DEFAULT 0 NOT NULL,
	`paidBalancePaise` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `CustomerWallet_customerId_unique` ON `CustomerWallet` (`customerId`);--> statement-breakpoint
CREATE TABLE `DeletedPhoneBlock` (
	`phoneHash` text PRIMARY KEY NOT NULL,
	`expiresAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `DeletedPhoneBlock_expiresAt_0` ON `DeletedPhoneBlock` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `Invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceNumber` text NOT NULL,
	`orderId` text NOT NULL,
	`pdfDataJson` text NOT NULL,
	`totalAmount` real NOT NULL,
	`pickupFee` real DEFAULT 0 NOT NULL,
	`serviceFee` real DEFAULT 0 NOT NULL,
	`taxableAmount` real DEFAULT 0 NOT NULL,
	`gstRate` real DEFAULT 0.18 NOT NULL,
	`gstAmount` real DEFAULT 0 NOT NULL,
	`cgstAmount` real DEFAULT 0 NOT NULL,
	`sgstAmount` real DEFAULT 0 NOT NULL,
	`igstAmount` real DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Invoice_invoiceNumber_unique` ON `Invoice` (`invoiceNumber`);--> statement-breakpoint
CREATE TABLE `Notification` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`orderId` text,
	`type` text DEFAULT 'WHATSAPP' NOT NULL,
	`recipient` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'SENT' NOT NULL,
	`provider` text DEFAULT 'FAST2SMS',
	`providerRequestId` text,
	`deliveryAttempts` integer DEFAULT 0 NOT NULL,
	`deliveryStatus` text DEFAULT 'sent',
	`statusDescription` text,
	`sentAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `Order` (
	`id` text PRIMARY KEY NOT NULL,
	`orderNumber` text NOT NULL,
	`customerId` text NOT NULL,
	`agentId` text,
	`addressId` text NOT NULL,
	`pickupType` text DEFAULT 'ASAP' NOT NULL,
	`scheduledSlot` text,
	`status` text DEFAULT 'BOOKING_RECEIVED' NOT NULL,
	`financialDirection` text DEFAULT 'JUNKITOUT_PAYS' NOT NULL,
	`estimatedTotal` real DEFAULT 0 NOT NULL,
	`actualTotal` real DEFAULT 0 NOT NULL,
	`pickupCharge` real DEFAULT 49 NOT NULL,
	`pickupFee` real DEFAULT 0,
	`serviceFee` real DEFAULT 0,
	`taxableAmount` real DEFAULT 0,
	`gstRate` real DEFAULT 0.18,
	`gstAmount` real DEFAULT 0,
	`cgstAmount` real DEFAULT 0,
	`sgstAmount` real DEFAULT 0,
	`igstAmount` real DEFAULT 0,
	`discountAmount` real DEFAULT 0 NOT NULL,
	`finalAmount` real DEFAULT 0 NOT NULL,
	`paymentStatus` text DEFAULT 'PENDING' NOT NULL,
	`wastePhotos` text DEFAULT '[]' NOT NULL,
	`cancellationReason` text,
	`notes` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	`subscriptionId` text,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`addressId`) REFERENCES `Address`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscriptionId`) REFERENCES `CustomerSubscription`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Order_orderNumber_unique` ON `Order` (`orderNumber`);--> statement-breakpoint
CREATE INDEX `Order_customerId_createdAt_0` ON `Order` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `Order_createdAt_1` ON `Order` (`createdAt`);--> statement-breakpoint
CREATE INDEX `Order_agentId_status_createdAt_2` ON `Order` (`agentId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `Order_status_createdAt_3` ON `Order` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `Order_paymentStatus_createdAt_4` ON `Order` (`paymentStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `Order_financialDirection_status_createdAt_5` ON `Order` (`financialDirection`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `Order_subscriptionId_6` ON `Order` (`subscriptionId`);--> statement-breakpoint
CREATE TABLE `OrderIdempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`customerId` text NOT NULL,
	`key` text NOT NULL,
	`payloadHash` text NOT NULL,
	`orderId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`expiresAt` text,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `OrderIdempotency_orderId_unique` ON `OrderIdempotency` (`orderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `OrderIdempotency_customerId_key_0` ON `OrderIdempotency` (`customerId`,`key`);--> statement-breakpoint
CREATE INDEX `OrderIdempotency_expiresAt_1` ON `OrderIdempotency` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `OrderItem` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`categoryId` text NOT NULL,
	`estimatedWeight` real DEFAULT 5 NOT NULL,
	`actualWeight` real,
	`ratePerKg` real DEFAULT 20 NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`categoryId`) REFERENCES `WasteCategory`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `OrderItem_orderId_0` ON `OrderItem` (`orderId`);--> statement-breakpoint
CREATE TABLE `OrderStatusHistory` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`oldStatus` text,
	`newStatus` text NOT NULL,
	`changedByUserId` text,
	`notes` text,
	`timestamp` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `OrderStatusHistory_orderId_0` ON `OrderStatusHistory` (`orderId`);--> statement-breakpoint
CREATE TABLE `Payment` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`amount` real NOT NULL,
	`direction` text DEFAULT 'JUNKITOUT_PAYS' NOT NULL,
	`gateway` text DEFAULT 'RAZORPAY' NOT NULL,
	`gatewayOrderId` text,
	`paymentId` text,
	`signature` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Payment_gatewayOrderId_direction_0` ON `Payment` (`gatewayOrderId`,`direction`);--> statement-breakpoint
CREATE INDEX `Payment_paymentId_1` ON `Payment` (`paymentId`);--> statement-breakpoint
CREATE INDEX `Payment_orderId_direction_status_2` ON `Payment` (`orderId`,`direction`,`status`);--> statement-breakpoint
CREATE INDEX `Payment_status_amount_3` ON `Payment` (`status`,`amount`);--> statement-breakpoint
CREATE TABLE `PricingRule` (
	`id` text PRIMARY KEY NOT NULL,
	`categoryId` text NOT NULL,
	`serviceAreaId` text,
	`ratePerKg` real NOT NULL,
	`pickupCharge` real DEFAULT 49 NOT NULL,
	`minPickupCharge` real DEFAULT 49 NOT NULL,
	`urgentSurcharge` real DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `WasteCategory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`serviceAreaId`) REFERENCES `ServiceArea`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `RefundAttempt` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`paymentId` text NOT NULL,
	`razorpayRefundId` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`amount` real NOT NULL,
	`failureReason` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `RefundAttempt_razorpayRefundId_unique` ON `RefundAttempt` (`razorpayRefundId`);--> statement-breakpoint
CREATE INDEX `RefundAttempt_orderId_0` ON `RefundAttempt` (`orderId`);--> statement-breakpoint
CREATE INDEX `RefundAttempt_paymentId_1` ON `RefundAttempt` (`paymentId`);--> statement-breakpoint
CREATE INDEX `RefundAttempt_status_createdAt_2` ON `RefundAttempt` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `RefundAttemptEvent` (
	`id` text PRIMARY KEY NOT NULL,
	`refundAttemptId` text NOT NULL,
	`eventType` text NOT NULL,
	`status` text,
	`details` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`refundAttemptId`) REFERENCES `RefundAttempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `RefundAttemptEvent_refundAttemptId_createdAt_0` ON `RefundAttemptEvent` (`refundAttemptId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `RefundRequest` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`paymentId` text NOT NULL,
	`requestedByUserId` text NOT NULL,
	`requestedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`status` text DEFAULT 'PENDING_ADMIN_REVIEW' NOT NULL,
	`amount` real NOT NULL,
	`reviewedByUserId` text,
	`reviewedAt` text,
	`reviewReason` text,
	`razorpayRefundId` text,
	`failureReason` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewedByUserId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `RefundRequest_orderId_unique` ON `RefundRequest` (`orderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `RefundRequest_paymentId_unique` ON `RefundRequest` (`paymentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `RefundRequest_razorpayRefundId_unique` ON `RefundRequest` (`razorpayRefundId`);--> statement-breakpoint
CREATE INDEX `RefundRequest_status_createdAt_0` ON `RefundRequest` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `Review` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`customerId` text NOT NULL,
	`agentId` text NOT NULL,
	`rating` integer DEFAULT 5 NOT NULL,
	`comment` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Review_orderId_unique` ON `Review` (`orderId`);--> statement-breakpoint
CREATE INDEX `Review_createdAt_0` ON `Review` (`createdAt`);--> statement-breakpoint
CREATE TABLE `ServiceArea` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text DEFAULT 'Bengaluru' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`etaMinutes` integer DEFAULT 25 NOT NULL,
	`basePickupCharge` real DEFAULT 49 NOT NULL,
	`boundaryPolygon` text NOT NULL,
	`centerLat` real DEFAULT 12.9166 NOT NULL,
	`centerLng` real DEFAULT 77.5996 NOT NULL,
	`pricingMultiplier` real DEFAULT 1 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ServiceArea_name_unique` ON `ServiceArea` (`name`);--> statement-breakpoint
CREATE TABLE `Settlement` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`customerId` text NOT NULL,
	`totalWeightKg` real NOT NULL,
	`amount` real NOT NULL,
	`breakdownJson` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`payoutId` text,
	`utr` text,
	`payoutMethod` text DEFAULT 'BANK_TRANSFER',
	`failureReason` text,
	`processedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`approvedAt` text,
	`paidAt` text,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Settlement_orderId_unique` ON `Settlement` (`orderId`);--> statement-breakpoint
CREATE INDEX `Settlement_status_createdAt_0` ON `Settlement` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `Settlement_customerId_createdAt_1` ON `Settlement` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `_SiteCommitGuard` (
	`expected` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `_SiteRevision` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `SubscriptionOffer` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`durationMonths` integer DEFAULT 1 NOT NULL,
	`durationDays` integer DEFAULT 30 NOT NULL,
	`billingPeriod` text DEFAULT 'MONTHLY' NOT NULL,
	`price` real NOT NULL,
	`pickupLimit` integer DEFAULT 4 NOT NULL,
	`benefitsJson` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `SubscriptionOffer_name_durationMonths_0` ON `SubscriptionOffer` (`name`,`durationMonths`);--> statement-breakpoint
CREATE INDEX `SubscriptionOffer_active_displayOrder_1` ON `SubscriptionOffer` (`active`,`displayOrder`);--> statement-breakpoint
CREATE INDEX `SubscriptionOffer_billingPeriod_active_2` ON `SubscriptionOffer` (`billingPeriod`,`active`);--> statement-breakpoint
CREATE TABLE `SubscriptionPayment` (
	`id` text PRIMARY KEY NOT NULL,
	`customerId` text NOT NULL,
	`offerId` text NOT NULL,
	`amount` real NOT NULL,
	`paymentMethod` text DEFAULT 'RAZORPAY' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`gatewayOrderId` text,
	`gatewayPaymentId` text,
	`walletTransactionId` text,
	`signature` text,
	`failureReason` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offerId`) REFERENCES `SubscriptionOffer`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `SubscriptionPayment_gatewayOrderId_unique` ON `SubscriptionPayment` (`gatewayOrderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `SubscriptionPayment_gatewayPaymentId_unique` ON `SubscriptionPayment` (`gatewayPaymentId`);--> statement-breakpoint
CREATE INDEX `SubscriptionPayment_customerId_createdAt_0` ON `SubscriptionPayment` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `SubscriptionPayment_offerId_status_createdAt_1` ON `SubscriptionPayment` (`offerId`,`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`name` text NOT NULL,
	`passwordHash` text,
	`role` text DEFAULT 'CUSTOMER' NOT NULL,
	`deletionRequestedAt` text,
	`deletionDueAt` text,
	`tokenVersion` integer DEFAULT 1 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_phone_unique` ON `User` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `User_email_unique` ON `User` (`email`);--> statement-breakpoint
CREATE INDEX `User_deletionDueAt_0` ON `User` (`deletionDueAt`);--> statement-breakpoint
CREATE TABLE `WalletBonusCampaign` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignName` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`bonusType` text DEFAULT 'PERCENTAGE' NOT NULL,
	`bonusPercentage` real,
	`minimumRechargeAmount` real DEFAULT 0 NOT NULL,
	`maximumBonusAmount` real,
	`campaignStartDate` text NOT NULL,
	`campaignEndDate` text NOT NULL,
	`bonusExpiryDays` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`isActive` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`createdBy` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `WalletBonusCampaign_status_isActive_campaignStartDate_campaignEndDate_0` ON `WalletBonusCampaign` (`status`,`isActive`,`campaignStartDate`,`campaignEndDate`);--> statement-breakpoint
CREATE TABLE `WalletBonusConsumption` (
	`id` text PRIMARY KEY NOT NULL,
	`grantId` text NOT NULL,
	`walletTransactionId` text NOT NULL,
	`consumedPaise` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`grantId`) REFERENCES `WalletBonusGrant`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`walletTransactionId`) REFERENCES `WalletTransaction`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `WalletBonusConsumption_grantId_walletTransactionId_0` ON `WalletBonusConsumption` (`grantId`,`walletTransactionId`);--> statement-breakpoint
CREATE INDEX `WalletBonusConsumption_walletTransactionId_1` ON `WalletBonusConsumption` (`walletTransactionId`);--> statement-breakpoint
CREATE TABLE `WalletBonusGrant` (
	`id` text PRIMARY KEY NOT NULL,
	`walletId` text NOT NULL,
	`customerId` text NOT NULL,
	`sourceTransactionId` text NOT NULL,
	`rechargeTransactionId` text NOT NULL,
	`campaignId` text,
	`grantedPaise` integer NOT NULL,
	`remainingPaise` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`expiresAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`walletId`) REFERENCES `CustomerWallet`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sourceTransactionId`) REFERENCES `WalletTransaction`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rechargeTransactionId`) REFERENCES `WalletTransaction`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`campaignId`) REFERENCES `WalletBonusCampaign`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `WalletBonusGrant_sourceTransactionId_unique` ON `WalletBonusGrant` (`sourceTransactionId`);--> statement-breakpoint
CREATE INDEX `WalletBonusGrant_walletId_status_expiresAt_createdAt_0` ON `WalletBonusGrant` (`walletId`,`status`,`expiresAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `WalletBonusGrant_customerId_status_expiresAt_createdAt_1` ON `WalletBonusGrant` (`customerId`,`status`,`expiresAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `WalletBonusGrant_rechargeTransactionId_2` ON `WalletBonusGrant` (`rechargeTransactionId`);--> statement-breakpoint
CREATE TABLE `WalletBonusSlab` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignId` text NOT NULL,
	`minimumAmount` real NOT NULL,
	`maximumAmount` real,
	`bonusPercentage` real,
	`fixedBonusAmount` real,
	`maximumBonusAmount` real,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `WalletBonusCampaign`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `WalletBonusSlab_campaignId_minimumAmount_0` ON `WalletBonusSlab` (`campaignId`,`minimumAmount`);--> statement-breakpoint
CREATE TABLE `WalletTransaction` (
	`id` text PRIMARY KEY NOT NULL,
	`walletId` text NOT NULL,
	`customerId` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`balanceAfter` real DEFAULT 0 NOT NULL,
	`amountPaise` integer DEFAULT 0 NOT NULL,
	`balanceAfterPaise` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`referenceId` text,
	`gatewayOrderId` text,
	`gatewayPaymentId` text,
	`reason` text,
	`adminId` text,
	`failureReason` text,
	`campaignId` text,
	`originalRechargeAmount` real,
	`bonusAmount` real,
	`bonusExpiryDate` text,
	`idempotencyKey` text,
	`bonusGrantId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`walletId`) REFERENCES `CustomerWallet`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`campaignId`) REFERENCES `WalletBonusCampaign`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`bonusGrantId`) REFERENCES `WalletBonusGrant`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `WalletTransaction_gatewayOrderId_unique` ON `WalletTransaction` (`gatewayOrderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `WalletTransaction_gatewayPaymentId_unique` ON `WalletTransaction` (`gatewayPaymentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `WalletTransaction_idempotencyKey_unique` ON `WalletTransaction` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `WalletTransaction_customerId_createdAt_0` ON `WalletTransaction` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `WalletTransaction_walletId_status_createdAt_1` ON `WalletTransaction` (`walletId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `WalletTransaction_type_status_createdAt_2` ON `WalletTransaction` (`type`,`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `WasteCategory` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text DEFAULT 'Recyclables' NOT NULL,
	`imageUrl` text,
	`icon` text DEFAULT 'Trash2' NOT NULL,
	`type` text DEFAULT 'RECYCLABLE_BUY' NOT NULL,
	`pricePerKg` real DEFAULT 20 NOT NULL,
	`minWeightKg` real DEFAULT 1 NOT NULL,
	`maxWeightKg` real DEFAULT 500 NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `WasteCategory_name_unique` ON `WasteCategory` (`name`);--> statement-breakpoint
CREATE TABLE `WeightRecord` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`recordedByUserId` text NOT NULL,
	`scalePhotoUrl` text,
	`weightJson` text NOT NULL,
	`notes` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recordedByUserId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE restrict
);

--> statement-breakpoint
CREATE TRIGGER "SiteCommitGuard_version" BEFORE INSERT ON "_SiteCommitGuard"
WHEN COALESCE((SELECT version FROM "_SiteRevision" WHERE id = 1), -1) <> NEW.expected
BEGIN SELECT RAISE(ABORT, 'SITE_TRANSACTION_CONFLICT'); END;
