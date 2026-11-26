ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3), ADD COLUMN "deletionDueAt" TIMESTAMP(3);
CREATE INDEX "User_deletionDueAt_idx" ON "User"("deletionDueAt");
CREATE TABLE "DeletedPhoneBlock" ("phoneHash" TEXT PRIMARY KEY, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "DeletedPhoneBlock_expiresAt_idx" ON "DeletedPhoneBlock"("expiresAt");
