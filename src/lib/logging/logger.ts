import { config } from "@/lib/config";

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
    environment: config.app.env,
    executionMode: config.ai.executionMode,
    ...context,
  });
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (!config.app.isProduction) {
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
