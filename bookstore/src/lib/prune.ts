// Retention pruning for append-heavy tables (OPS-006).
//
// AuditLog and WebhookDelivery grow without bound — every login, every
// order mutation, every webhook attempt writes a row that nothing ever
// deletes. After a year a busy org has millions of audit rows slowing
// the /audit-logs admin page and the entity lookups, and webhook
// payloads (full JSON bodies) quietly become the biggest table in the
// database.
//
// Retention windows (override with env):
//   AUDIT_LOG_RETENTION_DAYS          default 90
//   WEBHOOK_DELIVERY_RETENTION_DAYS   default 30
//
// WebhookDelivery: only DELIVERED rows older than the window are pruned —
// pending/failed deliveries must stay for the retry queue and for
// debugging subscriber complaints.
//
// Both jobs return the deleted count; the scheduler records it in the
// JobRun result for ops dashboards.

import { prisma } from "./db";

function retentionDays(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Delete AuditLog rows older than the retention window. */
export async function pruneAuditLogs(): Promise<{ deleted: number }> {
  const days = retentionDays(process.env.AUDIT_LOG_RETENTION_DAYS, 90);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const res = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { deleted: res.count };
}

/** Delete DELIVERED WebhookDelivery rows older than the retention window.
 *  Undelivered rows are never touched — the retry queue owns them. */
export async function pruneWebhookDeliveries(): Promise<{ deleted: number }> {
  const days = retentionDays(process.env.WEBHOOK_DELIVERY_RETENTION_DAYS, 30);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const res = await prisma.webhookDelivery.deleteMany({
    where: { deliveredAt: { not: null, lt: cutoff } },
  });
  return { deleted: res.count };
}
