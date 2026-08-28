// Simple error tracking utility
// Can be extended to send to external services (Sentry, LogRocket, etc.)

type ErrorContext = {
  component?: string;
  action?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
};

type ErrorSeverity = "error" | "warning" | "info";

/**
 * Track an error or warning
 * Currently logs to console in structured JSON format
 * Can be extended to send to external services
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

  // TODO: Send to external service
  // if (typeof window !== "undefined" && window.__ERROR_TRACKER__) {
  //   window.__ERROR_TRACKER__.captureException(error, context);
  // }
}

/**
 * Track a user action for debugging
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
 * Global error handler for unhandled errors
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
