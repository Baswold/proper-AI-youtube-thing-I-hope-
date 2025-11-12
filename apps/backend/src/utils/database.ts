/**
 * Prisma database client with connection pooling and error handling
 */

import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";
import { dbQueryDuration, dbQueryTotal } from "./metrics.js";

// Create Prisma client with logging configuration
export const prisma = new PrismaClient({
  log: [
    { level: "error", emit: "event" },
    { level: "warn", emit: "event" },
    { level: "query", emit: "event" },
  ],
});

// Log errors
prisma.$on("error", (e) => {
  logger.error({ err: e }, "Database error");
});

// Log warnings
prisma.$on("warn", (e) => {
  logger.warn(e, "Database warning");
});

// Log queries in development
if (process.env.NODE_ENV !== "production") {
  prisma.$on("query", (e) => {
    logger.debug(
      {
        query: e.query,
        params: e.params,
        duration: e.duration,
      },
      "Database query"
    );
  });
}

/**
 * Middleware to track query performance
 */
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = (Date.now() - start) / 1000;

  // Record metrics
  dbQueryDuration.observe(
    {
      operation: params.action,
      table: params.model || "unknown",
    },
    duration
  );

  dbQueryTotal.inc({
    operation: params.action,
    table: params.model || "unknown",
    status: "success",
  });

  return result;
});

/**
 * Connect to the database
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info("Database connected successfully");
  } catch (error) {
    logger.error({ err: error }, "Failed to connect to database");
    throw error;
  }
}

/**
 * Disconnect from the database
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info("Database disconnected successfully");
  } catch (error) {
    logger.error({ err: error }, "Failed to disconnect from database");
    throw error;
  }
}

/**
 * Health check for database
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latency?: number;
}> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      connected: true,
      latency,
    };
  } catch (error) {
    logger.error({ err: error }, "Database health check failed");
    return {
      connected: false,
    };
  }
}

export default prisma;
