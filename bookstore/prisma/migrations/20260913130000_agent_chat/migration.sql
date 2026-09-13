-- Server-side concierge conversation turns.
CREATE TABLE "AgentChatTurn" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentChatTurn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentChatTurn_chatId_createdAt_idx" ON "AgentChatTurn"("chatId", "createdAt");
CREATE INDEX "AgentChatTurn_orgId_createdAt_idx" ON "AgentChatTurn"("orgId", "createdAt");

ALTER TABLE "AgentChatTurn" ADD CONSTRAINT "AgentChatTurn_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
