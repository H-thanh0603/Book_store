-- B2: shopping-agent memory (CustomerMemory). Guests keyed by normalized
-- phone, members by customerId. Two partial-friendly uniques: Postgres treats
-- NULLs as distinct so each identity shape enforces its own dedupe.
CREATE TABLE "CustomerMemory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMemory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerMemory_orgId_customerId_key_key" ON "CustomerMemory"("orgId", "customerId", "key");
CREATE UNIQUE INDEX "CustomerMemory_orgId_phone_key_key" ON "CustomerMemory"("orgId", "phone", "key");
CREATE INDEX "CustomerMemory_orgId_customerId_idx" ON "CustomerMemory"("orgId", "customerId");
CREATE INDEX "CustomerMemory_orgId_phone_idx" ON "CustomerMemory"("orgId", "phone");
ALTER TABLE "CustomerMemory" ADD CONSTRAINT "CustomerMemory_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerMemory" ADD CONSTRAINT "CustomerMemory_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
