-- A1/A2: agent API keys + hash-chained session log (Agentic Web upgrade).
CREATE TABLE "AgentKey" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "orgId" TEXT,
    "quotaPerMin" INTEGER NOT NULL DEFAULT 120,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentKey_keyHash_key" ON "AgentKey"("keyHash");
CREATE INDEX "AgentKey_orgId_idx" ON "AgentKey"("orgId");
ALTER TABLE "AgentKey" ADD CONSTRAINT "AgentKey_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "keyId" TEXT,
    "day" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentEvent_keyId_day_createdAt_idx" ON "AgentEvent"("keyId", "day", "createdAt");
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_keyId_fkey"
  FOREIGN KEY ("keyId") REFERENCES "AgentKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
