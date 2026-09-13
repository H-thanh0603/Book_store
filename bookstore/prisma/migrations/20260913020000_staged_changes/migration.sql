-- B3: merchant-agent staged changes. The model proposes (PENDING); humans
-- APPROVE (applies via the same code as manual flows) or REJECT.
CREATE TABLE "StagedChange" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JsonB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "appliedRef" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StagedChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StagedChange_orgId_status_idx" ON "StagedChange"("orgId", "status");
ALTER TABLE "StagedChange" ADD CONSTRAINT "StagedChange_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
