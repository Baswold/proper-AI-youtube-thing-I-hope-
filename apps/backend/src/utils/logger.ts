/**
 * Structured logging with Pino
 * Provides fast, structured JSON logging with pretty-printing in development
 */

import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

// Create base logger with appropriate configuration
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),

  // Pretty print in development for better readability
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
          singleLine: false,
        },
      }
    : undefined,

  // Base configuration
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },

  // Add timestamp
  timestamp: pino.stdTimeFunctions.isoTime,

  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

/**
 * Create a child logger with additional context
 * @param context Additional context to include in all log messages
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Request logger for HTTP requests
 */
export function requestLogger(requestId: string, method: string, url: string) {
  return logger.child({ requestId, method, url });
}

/**
 * Session logger for session-specific logs
 */
export function sessionLogger(sessionId: string) {
  return logger.child({ sessionId });
}

/**
 * Adapter logger for adapter-specific logs
 */
export function adapterLogger(adapter: string, provider: string) {
  return logger.child({ adapter, provider });
}

/**
 * Log levels for convenience
 */
export const log = {
  trace: logger.trace.bind(logger),
  debug: logger.debug.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  fatal: logger.fatal.bind(logger),
};

export default logger;
