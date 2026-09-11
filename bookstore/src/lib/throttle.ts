// System-wide concurrency cap for checkout. During a flash sale, hundreds of
// shoppers may hit "buy" in the same instant; the database and external payment
// provider can only absorb so much contention. This semaphore lets
// MAX_CONCURRENT_CHECKOUTS through immediately and returns a tight 429 (with
// Retry-After) to the rest, so overload stays graceful instead of timing out DB
// pool slots or double-submitting payments.
//
// Two backends, one contract:
// - REDIS_URL set: a shared sorted-set lease across every app instance
//   (PM2 workers, multiple nodes). A Lua script atomically evicts dead
//   leases, counts live ones and grants/denies the slot; the lease expiry
//   also lets a crashed worker self-heal (its leases drop out after
//   CHECKOUT_LEASE_MS and free the slots).
// - no Redis: the original module-local counter — exact per instance, and
//   multi-instance deployments over-admit (documented in OPERATIONS.md).
// Shared Redis lease backend — see bottom of file. Import here so the
// module header reads top-down; hoisting makes mid-file imports legal but
// import/first prefers them at the top.
import { getRedis } from "./redis";
import { randomUUID } from "crypto";

export const MAX_CONCURRENT_CHECKOUTS = Number(process.env.MAX_CONCURRENT_CHECKOUTS ?? 20);
// How long a request is willing to wait in line before we tell the browser to
// retry. Keeps perceived "queue" off the server entirely.
const QUEUE_WAIT_MS = Number(process.env.CHECKOUT_QUEUE_WAIT_MS ?? 5_000);
const RETRY_AFTER_SEC = Math.max(1, Math.ceil(QUEUE_WAIT_MS / 1000));
// Redis lease lifetime. Must comfortably exceed the slowest checkout
// (payment gateway callback included); too-short leases let a slot be
// double-granted while the original holder is still finishing.
const REDIS_LEASE_MS = Number(process.env.CHECKOUT_LEASE_MS ?? 120_000);
const REDIS_KEY = "checkout:slots";

// KEYS[1]=sorted set. ARGV[1]=member, ARGV[2]=lease score (now+LEASE_MS),
// ARGV[3]=max. Returns 1 when the slot was granted, 0 when the pool is full.
// Dead leases (score < now) are evicted first, so a crashed worker never
// leaks a slot permanently.
const ACQUIRE_LUA = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[4])
  if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[3]) then
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
    return 1
  end
  return 0`;

export const checkoutBusyError = () =>
  Object.assign(new Error("Hệ thống thanh toán đang quá tải, vui lòng thử lại"), {
    status: 409, code: "RATE_LIMITED", retryAfter: RETRY_AFTER_SEC,
  });

let active = 0;
type Waiter = (err?: unknown) => void;
const queue: Waiter[] = [];

function releaseNext() {
  active -= 1;
  const next = queue.shift();
  if (next) {
    active += 1;
    next();
  }
}

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_CHECKOUTS) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const done: Waiter = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => {
      const idx = queue.indexOf(done);
      if (idx >= 0) queue.splice(idx, 1);
      // Reject (never throw) — a throw inside a timer callback is an uncaught
      // exception that crashes the worker; apiError() maps the attached
      // status/code/retryAfter to a graceful 409 with Retry-After.
      reject(checkoutBusyError());
    }, QUEUE_WAIT_MS);
    queue.push(done);
  });
}

// ── Shared Redis lease backend (REDIS_URL set) ──────────────────────────
//
// One sorted set per deployment: member = "pid:uuid", score = lease expiry
// (epoch ms). The Lua script is atomic: evict dead leases, count live ones,
// grant if under MAX. A crashed worker self-heals — its leases expire and the
// next acquire evicts them — so slots never leak permanently. Without Redis
// (or when Redis errors) every call degrades to the in-process path above.

// eval() path needs no cached SHA — see redisAcquire.

async function redisAcquire(): Promise<{ member: string } | "fallback" | "busy"> {
  const redis = getRedis();
  if (!redis) return "fallback";
  const member = `${process.pid}:${randomUUID()}`;
  const score = Date.now() + REDIS_LEASE_MS;
  try {
    // eval() re-sends the script text each call; Redis caches the compiled
    // body server-side, so the overhead is the extra bytes on the wire —
    // fine at checkout volumes, and it survives SCRIPT FLUSH (evalsha would
    // throw NOSCRIPT and need a reload path). Atomicity is the same.
    const granted = (await redis.eval(
      ACQUIRE_LUA, 1, REDIS_KEY,
      member, score, MAX_CONCURRENT_CHECKOUTS, Date.now(),
    )) as number;
    return granted === 1 ? { member } : "busy";
  } catch {
    // Redis down mid-flight: degrade to the per-instance counter rather than
    // failing checkouts outright (ops trade-off — over-admit beats hard down).
    return "fallback";
  }
}

async function redisRelease(member: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try { await redis.zrem(REDIS_KEY, member); } catch { /* best effort */ }
}

/** Wrap a checkout computation: admits <= MAX_CONCURRENT_CHECKOUTS at once. */
export async function withCheckoutSlot<T>(compute: () => Promise<T>): Promise<T> {
  // Redis backend: poll for a shared slot until the queue wait runs out.
  const acq = await redisAcquire();
  if (acq === "fallback") {
    await acquire();
    try { return await compute(); } finally { releaseNext(); }
  }
  if (acq !== "busy") {
    try { return await compute(); } finally { await redisRelease(acq.member); }
  }
  // Busy: poll every 100ms until QUEUE_WAIT_MS, then hand the browser a 409.
  const deadline = Date.now() + QUEUE_WAIT_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, 100));
    const retry = await redisAcquire();
    if (retry === "fallback") {
      await acquire();
      try { return await compute(); } finally { releaseNext(); }
    }
    if (retry !== "busy") {
      try { return await compute(); } finally { await redisRelease(retry.member); }
    }
    if (Date.now() >= deadline) throw checkoutBusyError();
  }
}
