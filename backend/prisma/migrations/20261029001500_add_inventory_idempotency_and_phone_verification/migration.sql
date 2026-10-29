-- AlterTable
ALTER TABLE "InventoryAudit" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAudit_idempotencyKey_key" ON "InventoryAudit"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryAudit_idempotencyKey_idx" ON "InventoryAudit"("idempotencyKey");
