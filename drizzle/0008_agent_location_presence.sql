-- Additive: legacy/default coordinates are deliberately not backfilled as GPS.
ALTER TABLE "Agent" ADD COLUMN "locationAccuracy" real;
ALTER TABLE "Agent" ADD COLUMN "locationCapturedAt" text;
ALTER TABLE "Agent" ADD COLUMN "locationReceivedAt" text;
ALTER TABLE "Agent" ADD COLUMN "bengaluruVerifiedAt" text;
ALTER TABLE "Agent" ADD COLUMN "bengaluruVerifiedLat" real;
ALTER TABLE "Agent" ADD COLUMN "bengaluruVerifiedLng" real;
CREATE INDEX "Agent_presence_status" ON "Agent" ("status", "locationReceivedAt");
