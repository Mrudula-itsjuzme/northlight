export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  correlationId?: string;
  brandId?: string;
  userId?: string;
  module?: string;
  [key: string]: unknown;
};

function formatLog(level: LogLevel, message: string, context?: LogContext) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    environment: process.env.NODE_ENV ?? "development",
    executionMode: process.env.AI_EXECUTION_MODE ?? "demo",
    ...context,
  });
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(formatLog("debug", message, context));
    }
  },
  info(message: string, context?: LogContext) {
    console.info(formatLog("info", message, context));
  },
  warn(message: string, context?: LogContext) {
    console.warn(formatLog("warn", message, context));
  },
  error(message: string, context?: LogContext) {
    console.error(formatLog("error", message, context));
  },
};
