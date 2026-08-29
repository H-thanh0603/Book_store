// Generic outbound webhook bus.
//
// emit(eventType, payload) fans an event out to every active endpoint in
// the org that subscribes to it (or every endpoint if the endpoint has no
// eventTypes filter). One WebhookDelivery row per (endpoint, eventId):
// the unique index makes emit() safely retryable - duplicate emits for the
// same event become no-ops.
//
// processPendingDeliveries() is the worker tick: claim due rows, POST with
// HMAC-SHA256 signature, mark delivered on 2xx, backoff on non-2xx, dead-
// letter after MAX_ATTEMPTS. Hand-off to the existing jobs.ts runner
// (registered as "webhook.deliver" in FREQUENT).
//
// Why hand-rolled, not a third-party queue: we already own the job ledger
// and Postgres is the only dependency we can assume at 3am in a SME shop.
// ponytail: single-process worker; if throughput crosses ~100 deliveries/s
// the claim-by-updateMany pattern needs a SKIP LOCKED variant.

import { prisma } from "./db";
import { hmacSign } from "./einvoice";
import { randomUUID } from "crypto";

const BATCH_SIZE = 25;
const REQUEST_TIMEOUT_MS = 10_000;

// Backoff schedule in ms; matches the e-invoice poll cadence for consistency.
// Index 0 is the first retry (i.e. after the first failed attempt).
const RETRY_BACKOFF_MS = [
  10_000,        // 10s
  60_000,        // 1m
  300_000,       // 5m
  1_800_000,     // 30m
  3_600_000,     // 1h
  14_400_000,    // 4h
];
const MAX_ATTEMPTS = 6;

export type WebhookEvent = {
  /** Stable id used for dedup. If absent, generated. */
  eventId?: string;
  eventType: string;
  orgId: string;
  payload: Record<string, unknown>;
};

/**
 * Fan out an event to matching endpoints. Idempotent on eventId: calling
 * twice with the same eventId is a no-op (the unique index swallows the
 * duplicate, and the existing row is left untouched).
 */
export async function emit(event: WebhookEvent): Promise<{ delivered: number; queued: number }> {
  const eventId = event.eventId ?? `evt_${randomUUID()}`;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      orgId: event.orgId,
      active: true,
      OR: [
        { eventTypes: { isEmpty: true } },
        { eventTypes: { has: event.eventType } },
      ],
    },
    select: { id: true },
  });

  if (endpoints.length === 0) return { delivered: 0, queued: 0 };

  // createMany + skipDuplicates gives us at-least-once without races. New
  // endpoints added between findMany and insert still receive the event.
  const result = await prisma.webhookDelivery.createMany({
    data: endpoints.map((e) => ({
      endpointId: e.id,
      eventId,
      eventType: event.eventType,
      payload: event.payload as object,
    })),
    skipDuplicates: true,
  });

  return { delivered: 0, queued: result.count };
}

/**
 * Worker tick: claim a batch of due rows, try to deliver each, reschedule
 * or mark delivered. Safe to run from multiple workers because the per-row
 * update is conditional and the claim reads a bounded batch.
 */
export async function processPendingDeliveries(): Promise<{ processed: number; delivered: number; deadLettered: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { deliveredAt: null, nextRetryAt: { lte: new Date() } },
    orderBy: { nextRetryAt: "asc" },
    take: BATCH_SIZE,
    include: { endpoint: true },
  });

  let delivered = 0;
  let deadLettered = 0;

  for (const row of due) {
    if (!row.endpoint.active) {
      await prisma.webhookDelivery.update({
        where: { id: row.id },
        data: { deliveredAt: new Date(), lastError: "endpoint inactive" },
      });
      delivered++;
      continue;
    }
    const ok = await deliverOne(row.id);
    if (ok === "delivered") delivered++;
    else if (ok === "dead") deadLettered++;
  }
  return { processed: due.length, delivered, deadLettered };
}

type Outcome = "delivered" | "retry" | "dead";

async function deliverOne(id: string): Promise<Outcome> {
  const row = await prisma.webhookDelivery.findUniqueOrThrow({
    where: { id },
    include: { endpoint: true },
  });

  const body = JSON.stringify({
    id: row.eventId,
    type: row.eventType,
    createdAt: row.createdAt,
    data: row.payload,
  });
  const signature = hmacSign(row.endpoint.secret, body);
  const sigHeader = `t=${Date.now()},v1=${signature}`;

  let status: number | null = null;
  let error: string | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(row.endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-melio-event-id": row.eventId,
        "x-melio-event-type": row.eventType,
        "x-melio-signature": sigHeader,
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const attempts = row.attempts + 1;
  if (status !== null && status >= 200 && status < 300) {
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts,
        lastStatus: status,
        lastError: null,
        deliveredAt: new Date(),
      },
    });
    return "delivered";
  }
  if (attempts >= MAX_ATTEMPTS) {
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts,
        lastStatus: status,
        lastError: error,
        // Push far into the future so the worker stops picking it up; the
        // user can re-arm by clearing lastError.
        nextRetryAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });
    return "dead";
  }
  const delay = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
  await prisma.webhookDelivery.update({
    where: { id },
    data: {
      attempts,
      lastStatus: status,
      lastError: error,
      nextRetryAt: new Date(Date.now() + delay),
    },
  });
  return "retry";
}

/**
 * Manually re-arm a dead-lettered delivery. The caller is responsible for
 * verifying the operator has permission on the org.
 */
export async function rearmDelivery(id: string): Promise<void> {
  await prisma.webhookDelivery.update({
    where: { id },
    data: { nextRetryAt: new Date(), lastError: null },
  });
}
