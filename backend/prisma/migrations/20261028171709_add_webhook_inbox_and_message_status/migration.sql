-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "status" TEXT;

-- CreateTable
CREATE TABLE "WebhookInbox" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'whatsapp',
    "providerMessageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "businessId" UUID,
    "payload" JSONB NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookInbox_providerMessageId_key" ON "WebhookInbox"("providerMessageId");

-- CreateIndex
CREATE INDEX "WebhookInbox_status_createdAt_idx" ON "WebhookInbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookInbox_providerMessageId_idx" ON "WebhookInbox"("providerMessageId");

-- CreateIndex
CREATE INDEX "Message_providerMessageId_idx" ON "Message"("providerMessageId");
