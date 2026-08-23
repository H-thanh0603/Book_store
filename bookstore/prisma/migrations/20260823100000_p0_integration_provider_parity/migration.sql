-- The original integration-provider migration was applied as an empty file while
-- some environments received this table through schema push/manual SQL. Keep this
-- repair migration safe for both existing and clean databases.
CREATE TABLE IF NOT EXISTS "IntegrationProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB,
    "webhookSecret" TEXT,
    "lastCatalogSyncAt" TIMESTAMP(3),
    "lastStockSyncAt" TIMESTAMP(3),
    "lastOrderSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationProvider_name_key"
ON "IntegrationProvider"("name");
