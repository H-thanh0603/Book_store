-- Customer storefront auth: password hash + email/phone verify tokens +
-- CustomerSession (mirror of staff Session, separate cookie).

-- 1. Add auth fields to Customer.
ALTER TABLE "Customer"
  ADD COLUMN "passwordHash"            TEXT,
  ADD COLUMN "emailVerifiedAt"         TIMESTAMP(3),
  ADD COLUMN "emailVerifyTokenHash"    TEXT,
  ADD COLUMN "emailVerifyExpiresAt"    TIMESTAMP(3);

-- 2. Unique email only when present. Existing customers have NULL email;
-- a plain UNIQUE constraint would treat NULLs as distinct, so we use a
-- partial index to enforce uniqueness on real emails without breaking
-- rows that never gave one.
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email") WHERE "email" IS NOT NULL;
CREATE INDEX "Customer_emailVerifyTokenHash_idx" ON "Customer"("emailVerifyTokenHash");

-- 3. CustomerSession: storefront-side session, mirrors staff Session.
-- SHA-256 hashed token, server-side expiry, indexed for cleanup.
CREATE TABLE "CustomerSession" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CustomerSession_token_key" ON "CustomerSession"("token");
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");
