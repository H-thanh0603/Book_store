-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "IntegrationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "WarehouseTaskType" AS ENUM ('PICK', 'PACK', 'PUTAWAY', 'CYCLE_COUNT');

-- CreateEnum
CREATE TYPE "WarehouseTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LossAlertStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ReplenishmentSuggestion" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "averageDailySales" DECIMAL(12,2) NOT NULL,
    "availableQty" INTEGER NOT NULL,
    "incomingQty" INTEGER NOT NULL,
    "safetyStock" INTEGER NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "recommendedQty" INTEGER NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "rationale" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplenishmentSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationJob" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "IntegrationJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseTask" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "WarehouseTaskType" NOT NULL,
    "status" "WarehouseTaskStatus" NOT NULL DEFAULT 'OPEN',
    "locationId" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "assignedTo" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WarehouseTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossAlert" (
    "id" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" "LossAlertStatus" NOT NULL DEFAULT 'OPEN',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "LossAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplenishmentSuggestion_status_recommendedQty_idx" ON "ReplenishmentSuggestion"("status", "recommendedQty");

-- CreateIndex
CREATE UNIQUE INDEX "ReplenishmentSuggestion_variantId_locationId_key" ON "ReplenishmentSuggestion"("variantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationJob_idempotencyKey_key" ON "IntegrationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IntegrationJob_provider_status_idx" ON "IntegrationJob"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseTask_number_key" ON "WarehouseTask"("number");

-- CreateIndex
CREATE INDEX "WarehouseTask_status_priority_idx" ON "WarehouseTask"("status", "priority");

-- CreateIndex
CREATE INDEX "LossAlert_status_severity_idx" ON "LossAlert"("status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "LossAlert_rule_entityType_entityId_key" ON "LossAlert"("rule", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "ReplenishmentSuggestion" ADD CONSTRAINT "ReplenishmentSuggestion_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplenishmentSuggestion" ADD CONSTRAINT "ReplenishmentSuggestion_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseTask" ADD CONSTRAINT "WarehouseTask_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
