-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE INDEX "Order_externalId_idx" ON "Order"("externalId");
