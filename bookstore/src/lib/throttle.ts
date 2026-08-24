// System-wide concurrency cap for checkout. During a flash sale, hundreds of
// shoppers may hit "buy" in the same instant; the database and external payment
// provider can only absorb so much contention. This in-process semaphore lets
// MAX_CONCURRENT_CHECKOUTS through immediately and returns a tight 429 (with
// Retry-After) to the rest, so overload stays graceful instead of timing out DB
// pool slots or double-submitting payments.
//
// Single-instance only today (the counter is module-local). Scale horizontally
// by replacing the semaphore with a shared Redis atomic-counter or an
// admission-control header set by the edge/reverse proxy — at which point this
// becomes a no-op fast path per instance.
import { fail } from "./api";

export const MAX_CONCURRENT_CHECKOUTS = Number(process.env.MAX_CONCURRENT_CHECKOUTS ?? 20);
// How long a request is willing to wait in line before we tell the browser to
// retry. Keeps perceived "queue" off the server entirely.
const QUEUE_WAIT_MS = Number(process.env.CHECKOUT_QUEUE_WAIT_MS ?? 5_000);
const RETRY_AFTER_SEC = Math.max(1, Math.ceil(QUEUE_WAIT_MS / 1000));

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
      settled = true;
      fail(409, "RATE_LIMITED", "Hệ thống thanh toán đang quá tải, vui lòng thử lại", { retryAfter: RETRY_AFTER_SEC });
      reject(new Error("queue timeout"));
    }, QUEUE_WAIT_MS);
    queue.push(done);
  });
}

/** Wrap a checkout computation: admits <= MAX_CONCURRENT_CHECKOUTS at once. */
export async function withCheckoutSlot<T>(compute: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await compute();
  } finally {
    releaseNext();
  }
}
