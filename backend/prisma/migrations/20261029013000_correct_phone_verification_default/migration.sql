-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phoneVerified" SET DEFAULT false;

-- Ensure all existing users default to unverified unless explicitly verified by trusted process
UPDATE "User" SET "phoneVerified" = false;
