-- Webhook bus: per-org outbound subscriptions with HMAC-signed delivery +
-- at-least-once retry. Mirrors the einvoice pattern (ledger + backoff
-- index) so the existing jobs.ts worker can claim and process without
-- a new scheduler tick.

CREATE TABLE "WebhookEndpoint" (
  "id"          TEXT NOT NULL,
  "orgId"       TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "secret"      TEXT NOT NULL,
  "eventTypes"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookEndpoint_orgId_active_idx" ON "WebhookEndpoint"("orgId", "active");
CREATE INDEX "WebhookEndpoint_provider_idx" ON "WebhookEndpoint"("provider");

CREATE TABLE "WebhookDelivery" (
  "id"          TEXT NOT NULL,
  "endpointId"  TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "lastStatus"  INTEGER,
  "lastError"   TEXT,
  "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId")
    REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE
);

-- Dedup key: same eventId never delivers twice to the same endpoint.
-- The job worker relies on this to keep at-least-once safe.
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");
CREATE INDEX "WebhookDelivery_nextRetryAt_idx" ON "WebhookDelivery"("nextRetryAt");
CREATE INDEX "WebhookDelivery_deliveredAt_idx" ON "WebhookDelivery"("deliveredAt");
