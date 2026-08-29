-- In-app support chat. One conversation per (org, customer); messages
-- append-only. Bot replies are status=OPEN until a staff reply flips
-- the conversation to ESCALATED. CLOSED is a terminal state.
CREATE TABLE "SupportConversation" (
  "id"            TEXT PRIMARY KEY,
  "orgId"         TEXT NOT NULL,
  "customerId"    TEXT NOT NULL,
  "subject"       TEXT,
  "status"        TEXT NOT NULL DEFAULT 'OPEN',
  "lastMessageAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP NOT NULL,
  UNIQUE ("orgId", "customerId")
);
CREATE INDEX "SupportConversation_orgId_status_idx" ON "SupportConversation" ("orgId", "status");
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE;

CREATE TABLE "SupportMessage" (
  "id"             TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SupportMessage_conversationId_createdAt_idx" ON "SupportMessage" ("conversationId", "createdAt");
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE;
