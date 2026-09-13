-- Concierge answer feedback (thumbs up/down): one row per click.
CREATE TABLE "AgentFeedback" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "customerId" TEXT,
    "rating" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "modelId" TEXT,
    "turnText" TEXT,
    "note" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFeedback_pkey" PRIMARY KEY ("id")
);

-- Table comment: rating ∈ {up, down}; agent ∈ {concierge, merchant};
-- ipHash is sha256 of client IP (no raw PII stored).

CREATE INDEX "AgentFeedback_orgId_agent_rating_createdAt_idx" ON "AgentFeedback"("orgId", "agent", "rating", "createdAt");

-- Add foreign keys
ALTER TABLE "AgentFeedback" ADD CONSTRAINT "AgentFeedback_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentFeedback" ADD CONSTRAINT "AgentFeedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
