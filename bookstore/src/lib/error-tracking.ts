// Error tracking: structured logs by default, real transports when configured.
//
// Before this, trackError was console.log only and the server-side handlers
// in instrumentation.ts never shipped anywhere — production errors lived in
// PM2 logs until someone grepped them. Now, in order of configuration:
//
//   SENTRY_DSN      → minimal Sentry Envelope API POST (no @sentry/node dep —
//                     we send one event per call, SDK weight isn't justified)
//   ERROR_WEBHOOK_URL → generic Slack/Discord/Telegram-style incoming webhook
//
// Both are fire-and-forget with a 5s timeout, deduped (identical
// message+context collapsed for 5 minutes) and throttled (max 30 sent per
// minute per process) so a crash loop can't burn quota or flood a channel.
// Neither transport failing may break the caller — logging must never be the
// thing that takes the app down. Without either env, behaviour is exactly
// the old structured-JSON console output.

type ErrorContext = {
  component?: string;
  action?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

type ErrorSeverity = "error" | "warning" | "info";

const DEDUP_WINDOW_MS = 5 * 60_000;
const THROTTLE_MAX = 30;
const THROTTLE_WINDOW_MS = 60_000;

const recentKeys = new Map<string, number>();
let throttleCount = 0;
let throttleWindowStart = Date.now();

function shouldSend(key: string): boolean {
  const now = Date.now();

  // Throttle: hard cap per rolling minute.
  if (now - throttleWindowStart >= THROTTLE_WINDOW_MS) {
    throttleWindowStart = now;
    throttleCount = 0;
  }
  if (throttleCount >= THROTTLE_MAX) return false;
  throttleCount++;

  // Dedup: identical fingerprint within the window is swallowed.
  const last = recentKeys.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return false;
  recentKeys.set(key, now);

  // opportunistic map cleanup so it can't grow unbounded
  if (recentKeys.size > 500) {
    for (const [k, t] of recentKeys) if (now - t >= DEDUP_WINDOW_MS) recentKeys.delete(k);
  }
  return true;
}

function fingerprint(message: string, context: ErrorContext): string {
  return `${message}|${context.component ?? ""}|${context.action ?? ""}`;
}

/** Fire-and-forget POST with timeout; never throws, never blocks the caller.
 *  Objects are JSON-encoded; strings are sent RAW — the Sentry envelope is
 *  a line-delimited text format and must not be re-stringified (it would
 *  arrive as one quoted JSON string and be rejected). */
async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(url, {
      method: "POST",
      headers: typeof body === "string"
        ? { "Content-Type": "text/plain", ...headers }
        : { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // swallow — error reporting must never become the outage
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the DSN pieces we need; null when unset/malformed. */
function parseSentryDsn(dsn: string | undefined): { url: string; key: string } | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const key = u.username;
    const projectId = u.pathname.replace(/^\//, "").split("/")[0];
    if (!key || !projectId) return null;
    // Envelope endpoint: https://host/api/<projectId>/envelope/
    return { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key };
  } catch {
    return null;
  }
}

/** Build a Sentry envelope (event API v7, minimal fields) as a string. */
function sentryEnvelope(
  key: string,
  level: ErrorSeverity,
  message: string,
  stack: string | undefined,
  context: ErrorContext
): string {
  const event: {
    event_id: string;
    timestamp: string;
    platform: string;
    environment: string;
    level: string;
    logger: string;
    message: { formatted: string };
    exception?: { values: Array<{ type: string; value: string; stacktrace: { frames: Array<{ filename?: string }> } }> };
    extra: Record<string, unknown>;
  } = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    environment: process.env.NODE_ENV ?? "development",
    level: level === "error" ? "error" : level === "warning" ? "warning" : "info",
    logger: "bookstore",
    message: { formatted: message },
    extra: {
      component: context.component,
      action: context.action,
      userId: context.userId,
      requestId: context.requestId,
      ...context.metadata,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    },
  };
  if (stack) event.exception = { values: [{ type: "Error", value: message, stacktrace: { frames: [{ filename: stack.split("\n")[0] ?? undefined }] } }] };
  // Envelope format: headers line, item type line, then the payload.
  return `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
}

// SENTRY_DSN is parsed per call (not at module load): test runners and
// hot-reload keep module registries alive while env changes, and a cached
// null would permanently disable the transport for the process.
function sentryTarget(): { url: string; key: string } | null {
  return parseSentryDsn(process.env.SENTRY_DSN)
};

/**
 * Track an error, warning or info with optional context. Always logs
 * structured JSON (stdout is still scraped by PM2/CloudWatch), and ships to
 * the configured transport(s) subject to dedup+throttle.
 */
export function trackError(
  error: Error | string,
  severity: ErrorSeverity = "error",
  context: ErrorContext = {}
) {
  const message = typeof error === "string" ? error : error.message;
  const stack = typeof error === "string" ? undefined : error.stack;

  const logEntry = {
    level: severity,
    event: "client_error",
    message,
    stack,
    ...context,
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };

  if (severity === "error") {
    console.error(JSON.stringify(logEntry));
  } else if (severity === "warning") {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }

  if (severity === "info") return; // info stays local — transports are for error/warning

  const sentry = sentryTarget()
  if (!sentry && !process.env.ERROR_WEBHOOK_URL) return; // log-only mode (old behaviour)
  if (!shouldSend(fingerprint(message, context))) return;

  if (sentry) {
    void postJson(sentry.url, sentryEnvelope(sentry.key, severity, message, stack, context), {
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${sentry.key}, sentry_client=bookstore/0.1`,
    });
  }

  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  if (webhookUrl) {
    const lines = [
      `*[${severity.toUpperCase()}]* ${message}`,
      context.component ? `component: \`${context.component}\`` : null,
      context.action ? `action: \`${context.action}\`` : null,
      context.userId ? `user: \`${context.userId}\`` : null,
      context.requestId ? `request: \`${context.requestId}\`` : null,
    ].filter(Boolean);
    void postJson(webhookUrl, {
      // Slack incoming-webhook shape; generic JSON POSTs work for
      // Discord/Telegram bridges too.
      text: lines.join(" · "),
      bookstore_severity: severity,
      bookstore_message: message,
      bookstore_context: context,
      bookstore_stack: stack,
    });
  }
}

/**
 * Track a user action for debugging (local log only — never shipped).
 */
export function trackAction(action: string, metadata?: Record<string, unknown>) {
  console.log(JSON.stringify({
    level: "info",
    event: "user_action",
    action,
    metadata,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Global error handler for unhandled errors/rejections (browser side).
 */
export function setupGlobalErrorTracking() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    trackError(event.error || event.message, "error", {
      component: "global",
      action: "unhandled_error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    trackError(
      event.reason instanceof Error ? event.reason : String(event.reason),
      "error",
      { component: "global", action: "unhandled_rejection" }
    );
  });
}
