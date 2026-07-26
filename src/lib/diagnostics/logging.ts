import "server-only";

export type ErrorSeverity = "info" | "warn" | "error" | "fatal";
export type ErrorCategory =
  | "expected"
  | "retryable"
  | "configuration"
  | "authorization"
  | "programming_error";

export type LogEvent = {
  timestamp: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  subsystem: string;
  message: string;
  brandId?: string;
  stage?: string;
  context?: Record<string, unknown>;
  errorName?: string;
  stack?: string;
};

/**
 * Emits a structured operational log entry.
 */
export function logOperationalEvent(event: Omit<LogEvent, "timestamp">): void {
  const fullLog: LogEvent = {
    timestamp: new Date().toISOString(),
    ...event,
  };

  const payload = JSON.stringify(fullLog);

  if (event.severity === "fatal" || event.severity === "error") {
    console.error(`[NORTHLIGHT:${event.subsystem.toUpperCase()}] ${payload}`);
  } else if (event.severity === "warn") {
    console.warn(`[NORTHLIGHT:${event.subsystem.toUpperCase()}] ${payload}`);
  } else {
    console.info(`[NORTHLIGHT:${event.subsystem.toUpperCase()}] ${payload}`);
  }
}

/**
 * Classifies an error instance into a structured ErrorCategory.
 */
export function classifyError(err: unknown): ErrorCategory {
  if (!(err instanceof Error)) return "programming_error";
  const msg = err.message.toLowerCase();

  if (msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("role")) {
    return "authorization";
  }
  if (msg.includes("missing environment") || msg.includes("not configured") || msg.includes("schema")) {
    return "configuration";
  }
  if (msg.includes("timeout") || msg.includes("rate limit") || msg.includes("econnreset") || msg.includes("503")) {
    return "retryable";
  }
  if (msg.includes("not found") || msg.includes("empty") || msg.includes("duplicate key")) {
    return "expected";
  }
  return "programming_error";
}
