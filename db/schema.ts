import { sqliteTable, text, integer, real, uniqueIndex, index, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const User = sqliteTable("User", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  email: text("email").unique(),
  name: text("name").notNull(),
  passwordHash: text("passwordHash"),
  role: text("role").notNull().default("CUSTOMER"),
  deletionRequestedAt: text("deletionRequestedAt"),
  deletionDueAt: text("deletionDueAt"),
  tokenVersion: integer("tokenVersion").notNull().default(1),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("User_deletionDueAt_0").on(table.deletionDueAt)]);

export const ContactEnquiry = sqliteTable("ContactEnquiry", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("OPEN"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("ContactEnquiry_status_createdAt_0").on(table.status,table.createdAt)]);

export const Customer = sqliteTable("Customer", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().unique().references((): AnySQLiteColumn => User.id, {onDelete:"cascade"}),
  referralCode: text("referralCode").unique(),
  points: integer("points").notNull().default(0),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
});

export const CustomerWallet = sqliteTable("CustomerWallet", {
  id: text("id").primaryKey(),
  customerId: text("customerId").notNull().unique().references((): AnySQLiteColumn => Customer.id, {onDelete:"cascade"}),
  balance: real("balance").notNull().default(0),
  balancePaise: integer("balancePaise").notNull().default(0),
  paidBalancePaise: integer("paidBalancePaise").notNull().default(0),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
});

export const WalletTransaction = sqliteTable("WalletTransaction", {
  refundAllocationJson: text("refundAllocationJson"),

  id: text("id").primaryKey(),
  walletId: text("walletId").notNull().references((): AnySQLiteColumn => CustomerWallet.id, {onDelete:"cascade"}),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"cascade"}),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  balanceAfter: real("balanceAfter").notNull().default(0),
  amountPaise: integer("amountPaise").notNull().default(0),
  balanceAfterPaise: integer("balanceAfterPaise").notNull().default(0),
  status: text("status").notNull().default("PENDING"),
  referenceId: text("referenceId"),
  gatewayOrderId: text("gatewayOrderId").unique(),
  gatewayPaymentId: text("gatewayPaymentId").unique(),
  reason: text("reason"),
  adminId: text("adminId").references((): AnySQLiteColumn => User.id, {onDelete:"set null"}),
  failureReason: text("failureReason"),
  campaignId: text("campaignId").references((): AnySQLiteColumn => WalletBonusCampaign.id, {onDelete:"set null"}),
  originalRechargeAmount: real("originalRechargeAmount"),
  bonusAmount: real("bonusAmount"),
  bonusExpiryDate: text("bonusExpiryDate"),
  idempotencyKey: text("idempotencyKey").unique(),
  bonusGrantId: text("bonusGrantId").references((): AnySQLiteColumn => WalletBonusGrant.id, {onDelete:"set null"}),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("WalletTransaction_customerId_createdAt_0").on(table.customerId,table.createdAt),index("WalletTransaction_walletId_status_createdAt_1").on(table.walletId,table.status,table.createdAt),index("WalletTransaction_type_status_createdAt_2").on(table.type,table.status,table.createdAt)]);

export const WalletBonusCampaign = sqliteTable("WalletBonusCampaign", {
  id: text("id").primaryKey(),
  campaignName: text("campaignName").notNull(),
  description: text("description").notNull().default(""),
  bonusType: text("bonusType").notNull().default("PERCENTAGE"),
  bonusPercentage: real("bonusPercentage"),
  minimumRechargeAmount: real("minimumRechargeAmount").notNull().default(0),
  maximumBonusAmount: real("maximumBonusAmount"),
  campaignStartDate: text("campaignStartDate").notNull(),
  campaignEndDate: text("campaignEndDate").notNull(),
  bonusExpiryDays: integer("bonusExpiryDays").notNull().default(0),
  status: text("status").notNull().default("DRAFT"),
  isActive: integer("isActive", {mode:'boolean'}).notNull().default(false),
  priority: integer("priority").notNull().default(0),
  createdBy: text("createdBy").references((): AnySQLiteColumn => User.id, {onDelete:"set null"}),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("WalletBonusCampaign_status_isActive_campaignStartDate_campaignEndDate_0").on(table.status,table.isActive,table.campaignStartDate,table.campaignEndDate)]);

export const WalletBonusSlab = sqliteTable("WalletBonusSlab", {
  id: text("id").primaryKey(),
  campaignId: text("campaignId").notNull().references((): AnySQLiteColumn => WalletBonusCampaign.id, {onDelete:"cascade"}),
  minimumAmount: real("minimumAmount").notNull(),
  maximumAmount: real("maximumAmount"),
  bonusPercentage: real("bonusPercentage"),
  fixedBonusAmount: real("fixedBonusAmount"),
  maximumBonusAmount: real("maximumBonusAmount"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("WalletBonusSlab_campaignId_minimumAmount_0").on(table.campaignId,table.minimumAmount)]);

export const WalletBonusGrant = sqliteTable("WalletBonusGrant", {
  id: text("id").primaryKey(),
  walletId: text("walletId").notNull().references((): AnySQLiteColumn => CustomerWallet.id, {onDelete:"cascade"}),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"cascade"}),
  sourceTransactionId: text("sourceTransactionId").notNull().unique().references((): AnySQLiteColumn => WalletTransaction.id, {onDelete:"restrict"}),
  rechargeTransactionId: text("rechargeTransactionId").notNull().references((): AnySQLiteColumn => WalletTransaction.id, {onDelete:"restrict"}),
  campaignId: text("campaignId").references((): AnySQLiteColumn => WalletBonusCampaign.id, {onDelete:"set null"}),
  grantedPaise: integer("grantedPaise").notNull(),
  remainingPaise: integer("remainingPaise").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  expiresAt: text("expiresAt"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("WalletBonusGrant_walletId_status_expiresAt_createdAt_0").on(table.walletId,table.status,table.expiresAt,table.createdAt),index("WalletBonusGrant_customerId_status_expiresAt_createdAt_1").on(table.customerId,table.status,table.expiresAt,table.createdAt),index("WalletBonusGrant_rechargeTransactionId_2").on(table.rechargeTransactionId)]);

export const WalletBonusConsumption = sqliteTable("WalletBonusConsumption", {
  id: text("id").primaryKey(),
  grantId: text("grantId").notNull().references((): AnySQLiteColumn => WalletBonusGrant.id, {onDelete:"restrict"}),
  walletTransactionId: text("walletTransactionId").notNull().references((): AnySQLiteColumn => WalletTransaction.id, {onDelete:"cascade"}),
  consumedPaise: integer("consumedPaise").notNull(),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [uniqueIndex("WalletBonusConsumption_grantId_walletTransactionId_0").on(table.grantId,table.walletTransactionId),index("WalletBonusConsumption_walletTransactionId_1").on(table.walletTransactionId)]);

export const SubscriptionOffer = sqliteTable("SubscriptionOffer", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  durationMonths: integer("durationMonths").notNull().default(1),
  durationDays: integer("durationDays").notNull().default(30),
  billingPeriod: text("billingPeriod").notNull().default("MONTHLY"),
  price: real("price").notNull(),
  pickupLimit: integer("pickupLimit").notNull().default(4),
  benefitsJson: text("benefitsJson").notNull().default("[]"),
  active: integer("active", {mode:'boolean'}).notNull().default(true),
  displayOrder: integer("displayOrder").notNull().default(0),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [uniqueIndex("SubscriptionOffer_name_durationMonths_0").on(table.name,table.durationMonths),index("SubscriptionOffer_active_displayOrder_1").on(table.active,table.displayOrder),index("SubscriptionOffer_billingPeriod_active_2").on(table.billingPeriod,table.active)]);

export const CustomerSubscription = sqliteTable("CustomerSubscription", {
  id: text("id").primaryKey(),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"cascade"}),
  offerId: text("offerId").notNull().references((): AnySQLiteColumn => SubscriptionOffer.id, {onDelete:"restrict"}),
  paymentId: text("paymentId").unique().references((): AnySQLiteColumn => SubscriptionPayment.id, {onDelete:"set null"}),
  status: text("status").notNull().default("ACTIVE"),
  startDate: text("startDate").notNull(),
  expiryDate: text("expiryDate").notNull(),
  pickupsAllowed: integer("pickupsAllowed").notNull().default(4),
  pickupsUsed: integer("pickupsUsed").notNull().default(0),
  autoRenew: integer("autoRenew", {mode:'boolean'}).notNull().default(false),
  cancelledAt: text("cancelledAt"),
  cancellationReason: text("cancellationReason"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("CustomerSubscription_customerId_status_expiryDate_0").on(table.customerId,table.status,table.expiryDate),index("CustomerSubscription_offerId_createdAt_1").on(table.offerId,table.createdAt),index("CustomerSubscription_status_expiryDate_2").on(table.status,table.expiryDate)]);

export const SubscriptionPayment = sqliteTable("SubscriptionPayment", {
  offerSnapshotJson: text("offerSnapshotJson").notNull().default("{}"),

  id: text("id").primaryKey(),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"cascade"}),
  offerId: text("offerId").notNull().references((): AnySQLiteColumn => SubscriptionOffer.id, {onDelete:"restrict"}),
  amount: real("amount").notNull(),
  paymentMethod: text("paymentMethod").notNull().default("RAZORPAY"),
  status: text("status").notNull().default("PENDING"),
  gatewayOrderId: text("gatewayOrderId").unique(),
  gatewayPaymentId: text("gatewayPaymentId").unique(),
  walletTransactionId: text("walletTransactionId"),
  signature: text("signature"),
  failureReason: text("failureReason"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("SubscriptionPayment_customerId_createdAt_0").on(table.customerId,table.createdAt),index("SubscriptionPayment_offerId_status_createdAt_1").on(table.offerId,table.status,table.createdAt)]);

export const Agent = sqliteTable("Agent", {
  kycRequired: integer("kycRequired", {mode:"boolean"}).notNull().default(false),
  id: text("id").primaryKey(),
  userId: text("userId").notNull().unique().references((): AnySQLiteColumn => User.id, {onDelete:"cascade"}),
  vehicleType: text("vehicleType").notNull().default("Three-Wheeler Auto Loading"),
  vehicleNumber: text("vehicleNumber").notNull().default("KA-05-JK-1024"),
  status: text("status").notNull().default("OFFLINE"),
  locationAccuracy: real("locationAccuracy"),
  locationCapturedAt: text("locationCapturedAt"),
  locationReceivedAt: text("locationReceivedAt"),
  bengaluruVerifiedAt: text("bengaluruVerifiedAt"),
  bengaluruVerifiedLat: real("bengaluruVerifiedLat"),
  bengaluruVerifiedLng: real("bengaluruVerifiedLng"),
  currentLat: real("currentLat").notNull().default(12.9166),
  currentLng: real("currentLng").notNull().default(77.5996),
  rating: real("rating").notNull().default(4.9),
  serviceAreas: text("serviceAreas").notNull().default("JP Nagar, Jayanagar, Koramangala, Electronic City"),
  tokenVersion: integer("tokenVersion").notNull().default(1),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("Agent_presence_status").on(table.status,table.locationReceivedAt)]);

export const AgentWallet = sqliteTable("AgentWallet", {
  id: text("id").primaryKey(),
  agentId: text("agentId").notNull().unique().references((): AnySQLiteColumn => Agent.id, {onDelete:"cascade"}),
  balance: real("balance").notNull().default(0),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
});

export const AgentWalletTransaction = sqliteTable("AgentWalletTransaction", {
  id: text("id").primaryKey(),
  walletId: text("walletId").notNull().references((): AnySQLiteColumn => AgentWallet.id, {onDelete:"cascade"}),
  agentId: text("agentId").notNull().references((): AnySQLiteColumn => Agent.id, {onDelete:"cascade"}),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  balanceAfter: real("balanceAfter").notNull().default(0),
  status: text("status").notNull().default("SUCCESS"),
  referenceId: text("referenceId").unique(),
  orderId: text("orderId").references((): AnySQLiteColumn => Order.id, {onDelete:"set null"}),
  reason: text("reason"),
  adminId: text("adminId").references((): AnySQLiteColumn => User.id, {onDelete:"set null"}),
  failureReason: text("failureReason"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("AgentWalletTransaction_agentId_createdAt_0").on(table.agentId,table.createdAt),index("AgentWalletTransaction_walletId_status_createdAt_1").on(table.walletId,table.status,table.createdAt),index("AgentWalletTransaction_type_status_createdAt_2").on(table.type,table.status,table.createdAt),index("AgentWalletTransaction_orderId_3").on(table.orderId)]);

export const Admin = sqliteTable("Admin", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().unique().references((): AnySQLiteColumn => User.id, {onDelete:"cascade"}),
  department: text("department").notNull().default("Operations"),
  accessLevel: text("accessLevel").notNull().default("FULL"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
});

export const Address = sqliteTable("Address", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references((): AnySQLiteColumn => User.id, {onDelete:"cascade"}),
  label: text("label").notNull().default("Home"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  houseNo: text("houseNo").notNull(),
  building: text("building"),
  street: text("street").notNull(),
  area: text("area").notNull(),
  landmark: text("landmark"),
  city: text("city").notNull().default("Bengaluru"),
  pincode: text("pincode").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  googlePlaceId: text("googlePlaceId"),
  pickupInstructions: text("pickupInstructions"),
  isDefault: integer("isDefault", {mode:'boolean'}).notNull().default(false),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  formattedAddress: text("formattedAddress"),
});

export const ServiceArea = sqliteTable("ServiceArea", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  city: text("city").notNull().default("Bengaluru"),
  status: text("status").notNull().default("ACTIVE"),
  etaMinutes: integer("etaMinutes").notNull().default(25),
  basePickupCharge: real("basePickupCharge").notNull().default(49),
  boundaryPolygon: text("boundaryPolygon").notNull(),
  centerLat: real("centerLat").notNull().default(12.9166),
  centerLng: real("centerLng").notNull().default(77.5996),
  pricingMultiplier: real("pricingMultiplier").notNull().default(1),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
});

export const WasteCategory = sqliteTable("WasteCategory", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  category: text("category").notNull().default("Recyclables"),
  imageUrl: text("imageUrl"),
  icon: text("icon").notNull().default("Trash2"),
  type: text("type").notNull().default("RECYCLABLE_BUY"),
  pricePerKg: real("pricePerKg").notNull().default(20),
  minWeightKg: real("minWeightKg").notNull().default(1),
  maxWeightKg: real("maxWeightKg").notNull().default(500),
  displayOrder: integer("displayOrder").notNull().default(0),
  active: integer("active", {mode:'boolean'}).notNull().default(true),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
});

export const PricingRule = sqliteTable("PricingRule", {
  id: text("id").primaryKey(),
  categoryId: text("categoryId").notNull().references((): AnySQLiteColumn => WasteCategory.id, {onDelete:"cascade"}),
  serviceAreaId: text("serviceAreaId").references((): AnySQLiteColumn => ServiceArea.id, {onDelete:"set null"}),
  ratePerKg: real("ratePerKg").notNull(),
  pickupCharge: real("pickupCharge").notNull().default(49),
  minPickupCharge: real("minPickupCharge").notNull().default(49),
  urgentSurcharge: real("urgentSurcharge").notNull().default(0),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
});

export const Order = sqliteTable("Order", {
  scheduledFor: text("scheduledFor"), assignmentDeadlineAt: text("assignmentDeadlineAt"), assignmentTimedOutAt: text("assignmentTimedOutAt"), timeoutPolicyVersion: integer("timeoutPolicyVersion").notNull().default(0),
  id: text("id").primaryKey(),
  orderNumber: text("orderNumber").notNull().unique(),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"restrict"}),
  agentId: text("agentId").references((): AnySQLiteColumn => Agent.id, {onDelete:"set null"}),
  addressId: text("addressId").notNull().references((): AnySQLiteColumn => Address.id, {onDelete:"restrict"}),
  pickupType: text("pickupType").notNull().default("ASAP"),
  scheduledSlot: text("scheduledSlot"),
  status: text("status").notNull().default("BOOKING_RECEIVED"),
  financialDirection: text("financialDirection").notNull().default("JUNKITOUT_PAYS"),
  estimatedTotal: real("estimatedTotal").notNull().default(0),
  actualTotal: real("actualTotal").notNull().default(0),
  pickupCharge: real("pickupCharge").notNull().default(49),
  pickupFee: real("pickupFee").default(0),
  serviceFee: real("serviceFee").default(0),
  taxableAmount: real("taxableAmount").default(0),
  gstRate: real("gstRate").default(0.18),
  gstAmount: real("gstAmount").default(0),
  cgstAmount: real("cgstAmount").default(0),
  sgstAmount: real("sgstAmount").default(0),
  igstAmount: real("igstAmount").default(0),
  discountAmount: real("discountAmount").notNull().default(0),
  finalAmount: real("finalAmount").notNull().default(0),
  paymentStatus: text("paymentStatus").notNull().default("PENDING"),
  wastePhotos: text("wastePhotos").notNull().default("[]"),
  cancellationReason: text("cancellationReason"),
  notes: text("notes"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
  subscriptionId: text("subscriptionId").references((): AnySQLiteColumn => CustomerSubscription.id, {onDelete:"set null"}),
}, table => [index("Order_customerId_createdAt_0").on(table.customerId,table.createdAt),index("Order_createdAt_1").on(table.createdAt),index("Order_agentId_status_createdAt_2").on(table.agentId,table.status,table.createdAt),index("Order_status_createdAt_3").on(table.status,table.createdAt),index("Order_paymentStatus_createdAt_4").on(table.paymentStatus,table.createdAt),index("Order_financialDirection_status_createdAt_5").on(table.financialDirection,table.status,table.createdAt),index("Order_subscriptionId_6").on(table.subscriptionId),index("Order_assignment_deadline_idx").on(table.timeoutPolicyVersion,table.agentId,table.assignmentDeadlineAt)]);

export const OrderIdempotency = sqliteTable("OrderIdempotency", {
  id: text("id").primaryKey(),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"cascade"}),
  key: text("key").notNull(),
  payloadHash: text("payloadHash").notNull(),
  orderId: text("orderId").notNull().unique().references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  expiresAt: text("expiresAt"),
}, table => [uniqueIndex("OrderIdempotency_customerId_key_0").on(table.customerId,table.key),index("OrderIdempotency_expiresAt_1").on(table.expiresAt)]);

export const OrderItem = sqliteTable("OrderItem", {
  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  categoryId: text("categoryId").notNull().references((): AnySQLiteColumn => WasteCategory.id, {onDelete:"restrict"}),
  estimatedWeight: real("estimatedWeight").notNull().default(5),
  actualWeight: real("actualWeight"),
  ratePerKg: real("ratePerKg").notNull().default(20),
  subtotal: real("subtotal").notNull().default(0),
}, table => [index("OrderItem_orderId_0").on(table.orderId)]);

export const WeightRecord = sqliteTable("WeightRecord", {
  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  recordedByUserId: text("recordedByUserId").notNull().references((): AnySQLiteColumn => User.id, {onDelete:"restrict"}),
  scalePhotoUrl: text("scalePhotoUrl"),
  weightJson: text("weightJson").notNull(),
  notes: text("notes"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
});

export const Payment = sqliteTable("Payment", {
  purpose: text("purpose").notNull().default("BOOKING"),
  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  amount: real("amount").notNull(),
  direction: text("direction").notNull().default("JUNKITOUT_PAYS"),
  gateway: text("gateway").notNull().default("RAZORPAY"),
  gatewayOrderId: text("gatewayOrderId"),
  paymentId: text("paymentId"),
  signature: text("signature"),
  status: text("status").notNull().default("PENDING"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("Payment_gatewayOrderId_direction_0").on(table.gatewayOrderId,table.direction),index("Payment_paymentId_1").on(table.paymentId),index("Payment_orderId_direction_status_2").on(table.orderId,table.direction,table.status),index("Payment_status_amount_3").on(table.status,table.amount)]);

export const RefundRequest = sqliteTable("RefundRequest", {
  destination: text("destination").notNull().default("WALLET"),

  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().unique().references((): AnySQLiteColumn => Order.id, {onDelete:"restrict"}),
  paymentId: text("paymentId").notNull().unique().references((): AnySQLiteColumn => Payment.id, {onDelete:"restrict"}),
  requestedByUserId: text("requestedByUserId").notNull().references((): AnySQLiteColumn => User.id, {onDelete:"restrict"}),
  requestedAt: text("requestedAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  status: text("status").notNull().default("PENDING_ADMIN_REVIEW"),
  amount: real("amount").notNull(),
  reviewedByUserId: text("reviewedByUserId").references((): AnySQLiteColumn => User.id, {onDelete:"set null"}),
  reviewedAt: text("reviewedAt"),
  reviewReason: text("reviewReason"),
  razorpayRefundId: text("razorpayRefundId").unique(),
  failureReason: text("failureReason"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
}, table => [index("RefundRequest_status_createdAt_0").on(table.status,table.createdAt)]);

export const RefundAttempt = sqliteTable("RefundAttempt", {
  destination: text("destination").notNull().default("WALLET"),

  id: text("id").primaryKey(),
  orderId: text("orderId").notNull(),
  paymentId: text("paymentId").notNull(),
  razorpayRefundId: text("razorpayRefundId").unique(),
  status: text("status").notNull().default("PENDING"),
  amount: real("amount").notNull(),
  failureReason: text("failureReason"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("RefundAttempt_orderId_0").on(table.orderId),index("RefundAttempt_paymentId_1").on(table.paymentId),index("RefundAttempt_status_createdAt_2").on(table.status,table.createdAt)]);

export const RefundAttemptEvent = sqliteTable("RefundAttemptEvent", {
  id: text("id").primaryKey(),
  refundAttemptId: text("refundAttemptId").notNull().references((): AnySQLiteColumn => RefundAttempt.id, {onDelete:"cascade"}),
  eventType: text("eventType").notNull(),
  status: text("status"),
  details: text("details"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("RefundAttemptEvent_refundAttemptId_createdAt_0").on(table.refundAttemptId,table.createdAt)]);

export const Settlement = sqliteTable("Settlement", {
  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().unique().references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"restrict"}),
  totalWeightKg: real("totalWeightKg").notNull(),
  amount: real("amount").notNull(),
  breakdownJson: text("breakdownJson").notNull(),
  status: text("status").notNull().default("PENDING"),
  payoutId: text("payoutId"),
  utr: text("utr"),
  payoutMethod: text("payoutMethod").default("BANK_TRANSFER"),
  failureReason: text("failureReason"),
  processedAt: text("processedAt"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  approvedAt: text("approvedAt"),
  paidAt: text("paidAt"),
}, table => [index("Settlement_status_createdAt_0").on(table.status,table.createdAt),index("Settlement_customerId_createdAt_1").on(table.customerId,table.createdAt)]);

export const AgentLocation = sqliteTable("AgentLocation", {
  id: text("id").primaryKey(),
  agentId: text("agentId").notNull().references((): AnySQLiteColumn => Agent.id, {onDelete:"cascade"}),
  orderId: text("orderId").references((): AnySQLiteColumn => Order.id, {onDelete:"set null"}),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  speed: real("speed").default(0),
  timestamp: text("timestamp").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("AgentLocation_agentId_orderId_timestamp_0").on(table.agentId,table.orderId,table.timestamp)]);

export const OrderStatusHistory = sqliteTable("OrderStatusHistory", {
  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  oldStatus: text("oldStatus"),
  newStatus: text("newStatus").notNull(),
  changedByUserId: text("changedByUserId").references((): AnySQLiteColumn => User.id, {onDelete:"set null"}),
  notes: text("notes"),
  timestamp: text("timestamp").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("OrderStatusHistory_orderId_0").on(table.orderId)]);

export const Notification = sqliteTable("Notification", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references((): AnySQLiteColumn => User.id, {onDelete:"cascade"}),
  orderId: text("orderId").references((): AnySQLiteColumn => Order.id, {onDelete:"set null"}),
  type: text("type").notNull().default("WHATSAPP"),
  recipient: text("recipient").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("SENT"),
  provider: text("provider").default("FAST2SMS"),
  providerRequestId: text("providerRequestId"),
  deliveryAttempts: integer("deliveryAttempts").notNull().default(0),
  deliveryStatus: text("deliveryStatus").default("sent"),
  statusDescription: text("statusDescription"),
  sentAt: text("sentAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
});

export const Coupon = sqliteTable("Coupon", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: text("discountType").notNull().default("FLAT"),
  discountValue: real("discountValue").notNull().default(50),
  minOrderValue: real("minOrderValue").notNull().default(100),
  maxDiscount: real("maxDiscount").default(100),
  active: integer("active", {mode:'boolean'}).notNull().default(true),
  expiryDate: text("expiryDate"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("Coupon_active_expiryDate_0").on(table.active,table.expiryDate)]);

export const Complaint = sqliteTable("Complaint", {
  id: text("id").primaryKey(),
  orderId: text("orderId").references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"restrict"}),
  category: text("category").notNull().default("WEIGHT_DISPUTE"),
  description: text("description"),
  photoUrl: text("photoUrl"),
  status: text("status").notNull().default("OPEN"),
  resolutionNotes: text("resolutionNotes"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
});

export const Review = sqliteTable("Review", {
  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().unique().references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  customerId: text("customerId").notNull().references((): AnySQLiteColumn => Customer.id, {onDelete:"restrict"}),
  agentId: text("agentId").notNull().references((): AnySQLiteColumn => Agent.id, {onDelete:"restrict"}),
  rating: integer("rating").notNull().default(5),
  comment: text("comment"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("Review_createdAt_0").on(table.createdAt)]);

export const Invoice = sqliteTable("Invoice", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoiceNumber").notNull().unique(),
  orderId: text("orderId").notNull().references((): AnySQLiteColumn => Order.id, {onDelete:"cascade"}),
  pdfDataJson: text("pdfDataJson").notNull(),
  totalAmount: real("totalAmount").notNull(),
  pickupFee: real("pickupFee").notNull().default(0),
  serviceFee: real("serviceFee").notNull().default(0),
  taxableAmount: real("taxableAmount").notNull().default(0),
  gstRate: real("gstRate").notNull().default(0.18),
  gstAmount: real("gstAmount").notNull().default(0),
  cgstAmount: real("cgstAmount").notNull().default(0),
  sgstAmount: real("sgstAmount").notNull().default(0),
  igstAmount: real("igstAmount").notNull().default(0),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
});

export const AuditLog = sqliteTable("AuditLog", {
  id: text("id").primaryKey(),
  userId: text("userId").references((): AnySQLiteColumn => User.id, {onDelete:"set null"}),
  userName: text("userName").notNull().default("System"),
  action: text("action").notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  ipAddress: text("ipAddress").default("127.0.0.1"),
  timestamp: text("timestamp").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("AuditLog_timestamp_0").on(table.timestamp),index("AuditLog_action_timestamp_1").on(table.action,table.timestamp)]);

export const DeletedPhoneBlock = sqliteTable("DeletedPhoneBlock", {
  phoneHash: text("phoneHash").primaryKey(),
  expiresAt: text("expiresAt").notNull(),
}, table => [index("DeletedPhoneBlock_expiresAt_0").on(table.expiresAt)]);

export const SiteRevision = sqliteTable('_SiteRevision',{id:integer('id').primaryKey(),version:integer('version').notNull().default(0)});
export const SiteCommitGuard = sqliteTable('_SiteCommitGuard',{expected:integer('expected').notNull()});
export const SiteBootstrap = sqliteTable('_SiteBootstrap',{id:integer('id').primaryKey()});

export const VoiceCall = sqliteTable('VoiceCall', {
 id:text('id').primaryKey(),
 orderId:text('orderId').notNull().references(()=>Order.id,{onDelete:'cascade'}),
 callerUserId:text('callerUserId').notNull().references(()=>User.id,{onDelete:'cascade'}),
 attemptKey:text('attemptKey').notNull().unique(),
 gatewaySid:text('gatewaySid').unique(),
 status:text('status').notNull().default('CREATING'),
 duration:integer('duration'),
 createdAt:text('createdAt').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
 updatedAt:text('updatedAt').notNull(),
},table=>[index('VoiceCall_orderId_createdAt_idx').on(table.orderId,table.createdAt),index('VoiceCall_callerUserId_createdAt_idx').on(table.callerUserId,table.createdAt)]);

export const SupportCall = sqliteTable('SupportCall', {
 id:text('id').primaryKey(),
 customerId:text('customerId').notNull().references(()=>Customer.id,{onDelete:'cascade'}),
 callerUserId:text('callerUserId').notNull().references(()=>User.id,{onDelete:'cascade'}),
 teamPhoneHash:text('teamPhoneHash').notNull(),
 teamPhoneLast4:text('teamPhoneLast4').notNull(),
 attemptKey:text('attemptKey').notNull().unique(),
 gatewaySid:text('gatewaySid').unique(),
 status:text('status').notNull().default('CREATING'),
 duration:integer('duration'),
 createdAt:text('createdAt').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
 updatedAt:text('updatedAt').notNull(),
},table=>[index('SupportCall_customerId_createdAt_idx').on(table.customerId,table.createdAt),index('SupportCall_callerUserId_createdAt_idx').on(table.callerUserId,table.createdAt),index('SupportCall_teamPhoneHash_createdAt_idx').on(table.teamPhoneHash,table.createdAt)]);

export const PickupEarning = sqliteTable("PickupEarning", {
  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().unique().references((): AnySQLiteColumn => Order.id,{onDelete:"cascade"}),
  agentId: text("agentId").notNull().references((): AnySQLiteColumn => Agent.id,{onDelete:"cascade"}),
  grossPaise: integer("grossPaise").notNull(), agentPaise: integer("agentPaise").notNull(),
  companyGrossPaise: integer("companyGrossPaise").notNull(), serviceFeePaise: integer("serviceFeePaise").notNull(),
  gstPaise: integer("gstPaise").notNull(), cgstPaise: integer("cgstPaise").notNull(),
  sgstPaise: integer("sgstPaise").notNull(), igstPaise: integer("igstPaise").notNull(),
  gstRate: real("gstRate").notNull(), policy: text("policy").notNull().default("65_35_GST_INCLUDED_V1"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
}, table => [index("PickupEarning_agentId_createdAt").on(table.agentId,table.createdAt)]);
export const AgentKyc = sqliteTable("AgentKyc", {
  flowVersion: integer("flowVersion").notNull().default(0),
  evidenceJson: text("evidenceJson").notNull().default("{}"),
  profileJson: text("profileJson").notNull().default("{}"),
  issuesJson: text("issuesJson").notNull().default("[]"),
  reviewReason: text("reviewReason"),
  revision: integer("revision").notNull().default(0),

  id: text("id").primaryKey(),
  agentId: text("agentId").notNull().unique().references((): AnySQLiteColumn => Agent.id,{onDelete:"cascade"}),
  verificationId: text("verificationId").notNull().unique(), templateName: text("templateName").notNull(),
  providerStatus: text("providerStatus").notNull().default("CREATING"),
  reviewStatus: text("reviewStatus").notNull().default("PENDING"), formLink: text("formLink"),
  expiresAt: text("expiresAt").notNull(), consentAt: text("consentAt").notNull(),
  checksJson: text("checksJson").notNull().default("[]"), reviewedBy: text("reviewedBy"), reviewedAt: text("reviewedAt"),
  createdAt: text("createdAt").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),
  updatedAt: text("updatedAt").notNull(),
});

export const PickupGate = sqliteTable("PickupGate", {
  orderId: text("orderId").primaryKey().references((): AnySQLiteColumn => Order.id,{onDelete:"cascade"}),
  nonce: text("nonce").notNull(), arrivedAt: text("arrivedAt").notNull(), verifiedAt: text("verifiedAt"), verifiedAgentId: text("verifiedAgentId"),
  failedAttempts: integer("failedAttempts").notNull().default(0), lockedUntil: text("lockedUntil"), updatedAt: text("updatedAt").notNull(),
});
export const TrackingRoute = sqliteTable("TrackingRoute", {
  orderId: text("orderId").primaryKey().references((): AnySQLiteColumn => Order.id,{onDelete:"cascade"}),
  agentId: text("agentId").notNull(), sourceLat: real("sourceLat").notNull(), sourceLng: real("sourceLng").notNull(),
  encodedPolyline: text("encodedPolyline").notNull(), durationSeconds: integer("durationSeconds").notNull(), distanceMeters: integer("distanceMeters").notNull(),
  computedAt: text("computedAt").notNull(), locationAt: text("locationAt").notNull(), refreshClaimedAt: text("refreshClaimedAt"),
});

export const voiceRoutingConfig = sqliteTable('VoiceRoutingConfig', {
 id: text('id').primaryKey().notNull(),
 supportFallbackUserId:text('supportFallbackUserId'),
 flowUrl: text('flowUrl').notNull(),
 updatedAt: text('updatedAt').notNull(),
});

export const OrderWeightAdjustment = sqliteTable('OrderWeightAdjustment', {
 id:text('id').primaryKey(), orderId:text('orderId').notNull().unique().references(()=>Order.id,{onDelete:'cascade'}),
 bookedPaise:integer('bookedPaise').notNull(),actualPaise:integer('actualPaise').notNull(),extraPaise:integer('extraPaise').notNull().default(0),refundPaise:integer('refundPaise').notNull().default(0),
 weightsJson:text('weightsJson').notNull(),weightsHash:text('weightsHash').notNull(),status:text('status').notNull().default('READY'),
 qrId:text('qrId').unique(),qrImageUrl:text('qrImageUrl'),qrExpiresAt:text('qrExpiresAt'),gatewayOrderId:text('gatewayOrderId').unique(),providerPaymentId:text('providerPaymentId').unique(),
 createdAt:text('createdAt').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'))`),updatedAt:text('updatedAt').notNull(),
});
