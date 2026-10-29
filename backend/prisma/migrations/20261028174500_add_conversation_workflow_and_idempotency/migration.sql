-- CreateEnum
CREATE TYPE "ConversationWorkflowState" AS ENUM ('IDLE', 'SELECTING_SERVICE', 'SELECTING_DATE', 'OFFERING_SLOTS', 'COLLECTING_DETAILS', 'AWAITING_CONFIRMATION', 'BOOKED', 'RESCHEDULING', 'CANCELLING', 'ESCALATION_REQUIRED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "pendingProposal" JSONB,
ADD COLUMN     "stateVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workflowState" "ConversationWorkflowState" NOT NULL DEFAULT 'IDLE';

-- AlterTable
ALTER TABLE "WebhookInbox" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_idempotencyKey_key" ON "Appointment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Appointment_idempotencyKey_idx" ON "Appointment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Conversation_businessId_workflowState_idx" ON "Conversation"("businessId", "workflowState");

-- CreateIndex
CREATE INDEX "WebhookInbox_status_nextRetryAt_idx" ON "WebhookInbox"("status", "nextRetryAt");
