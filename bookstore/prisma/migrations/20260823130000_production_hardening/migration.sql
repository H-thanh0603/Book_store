-- Shared rate limits survive restarts and work across multiple web instances.
CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- Job leases allow a different worker to recover work after a process crash.
ALTER TABLE "JobRun" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3), ADD COLUMN "workerId" TEXT;
CREATE INDEX "JobRun_status_leaseExpiresAt_idx" ON "JobRun"("status", "leaseExpiresAt");

