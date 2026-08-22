-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "invoiceAmount" BIGINT,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "payableStatus" TEXT,
ADD COLUMN     "supplierConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAdjustmentItem" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,

    CONSTRAINT "InventoryAdjustmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProductPrice" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "unitCost" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAdjustment_number_key" ON "InventoryAdjustment"("number");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_status_idx" ON "InventoryAdjustment"("status");

-- CreateIndex
CREATE INDEX "SupplierProductPrice_supplierId_variantId_recordedAt_idx" ON "SupplierProductPrice"("supplierId", "variantId", "recordedAt");

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "InventoryAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductPrice" ADD CONSTRAINT "SupplierProductPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductPrice" ADD CONSTRAINT "SupplierProductPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
