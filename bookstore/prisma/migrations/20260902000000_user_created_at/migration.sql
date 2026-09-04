-- Schema drift fix: `User.createdAt` exists in schema.prisma (added for signup
-- trial audit) but no migration ever added the column. Local DB was patched
-- by hand on 2026-09-02; this migration records it so fresh databases and
-- `migrate deploy` stay consistent.

ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
