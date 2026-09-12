-- Async export jobs (WS2.1): large exports run in the worker, files land in
-- var/exports/. PENDING → RUNNING → SUCCEEDED | FAILED.
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filePath" TEXT,
    "rowCount" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExportJob_status_createdAt_idx" ON "ExportJob"("status", "createdAt");
CREATE INDEX "ExportJob_orgId_createdAt_idx" ON "ExportJob"("orgId", "createdAt");
