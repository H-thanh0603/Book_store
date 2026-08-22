-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "WarehouseTask" ADD COLUMN     "waveId" TEXT;

-- CreateTable
CREATE TABLE "WarehouseTaskItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "processedQty" INTEGER NOT NULL DEFAULT 0,
    "binCode" TEXT,

    CONSTRAINT "WarehouseTaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseTaskItem_taskId_idx" ON "WarehouseTaskItem"("taskId");

-- CreateIndex
CREATE INDEX "JobRun_status_nextRunAt_idx" ON "JobRun"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "JobRun_kind_idx" ON "JobRun"("kind");

-- CreateIndex
CREATE INDEX "WarehouseTask_waveId_idx" ON "WarehouseTask"("waveId");

-- AddForeignKey
ALTER TABLE "WarehouseTaskItem" ADD CONSTRAINT "WarehouseTaskItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WarehouseTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseTaskItem" ADD CONSTRAINT "WarehouseTaskItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
