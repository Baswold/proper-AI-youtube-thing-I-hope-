/**
 * Fastify server with modern architecture
 * Replaces Express with Fastify for better performance and TypeScript support
 */

import Fastify, { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyJwt from "@fastify/jwt";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import * as Sentry from "@sentry/node";
import { logger } from "./utils/logger.js";
import { appConfig } from "./config.js";
import { getMetrics, httpRequestDuration, httpRequestTotal } from "./utils/metrics.js";
import { connectDatabase, checkDatabaseHealth, disconnectDatabase } from "./utils/database.js";
import { checkRedisHealth, disconnectRedis } from "./utils/redis.js";

// Initialize Sentry for error tracking (if configured)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
  logger.info("Sentry initialized");
}

/**
 * Create and configure Fastify server
 */
export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger,
    requestIdLogLabel: "requestId",
    disableRequestLogging: false,
    trustProxy: true,
  });

  // ============================================================================
  // Request Timing & Metrics
  // ============================================================================

  server.addHook("onRequest", async (request, reply) => {
    request.startTime = Date.now();
  });

  server.addHook("onResponse", async (request, reply) => {
    const duration = (Date.now() - (request.startTime || Date.now())) / 1000;
    const route = request.routeOptions?.url || request.url;

    // Record metrics
    httpRequestDuration.observe(
      {
        method: request.method,
        route,
        status_code: reply.statusCode,
      },
      duration
    );

    httpRequestTotal.inc({
      method: request.method,
      route,
      status_code: reply.statusCode,
    });
  });

  // ============================================================================
  // Security & CORS
  // ============================================================================

  await server.register(fastifyHelmet, {
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  });

  await server.register(fastifyCors, {
    origin: appConfig.corsOrigin,
    credentials: true,
  });

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  await server.register(fastifyRateLimit, {
    max: 100, // Max requests per window
    timeWindow: "1 minute",
    cache: 10000, // Cache size
    allowList: ["127.0.0.1"], // Whitelist localhost
    redis: process.env.REDIS_URL ? await import("ioredis").then(m => new m.default(process.env.REDIS_URL!)) : undefined,
    nameSpace: "basil-ratelimit:",
    continueExceeding: true,
    skipOnError: true, // Don't fail if Redis is down
  });

  // ============================================================================
  // JWT Authentication
  // ============================================================================

  await server.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || "super-secret-key-change-in-production",
    sign: {
      expiresIn: "1h",
    },
  });

  // Authentication decorator
  server.decorate("authenticate", async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: "Unauthorized", message: "Invalid or missing token" });
    }
  });

  // ============================================================================
  // API Documentation (Swagger)
  // ============================================================================

  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Basil Voice Studio API",
        description: "AI-powered three-way voice conversation studio for YouTube content",
        version: "2.0.0",
      },
      servers: [
        {
          url: `http://localhost:${appConfig.port}`,
          description: "Development server",
        },
      ],
      tags: [
        { name: "health", description: "Health check endpoints" },
        { name: "auth", description: "Authentication endpoints" },
        { name: "sessions", description: "Recording session management" },
        { name: "recordings", description: "Recording file management" },
        { name: "analytics", description: "Usage analytics and metrics" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });

  // ============================================================================
  // Routes
  // ============================================================================

  // Health check endpoint
  server.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        description: "Comprehensive health check with database and Redis status",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["ok", "degraded", "error"] },
              timestamp: { type: "string" },
              version: { type: "string" },
              uptime: { type: "number" },
              adapters: {
                type: "object",
                properties: {
                  enabled: { type: "boolean" },
                  stt: { type: "string" },
                  tts: { type: "string" },
                  guest: { type: "string" },
                },
              },
              database: {
                type: "object",
                properties: {
                  connected: { type: "boolean" },
                  latency: { type: "number" },
                },
              },
              redis: {
                type: "object",
                properties: {
                  connected: { type: "boolean" },
                  latency: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const dbHealth = await checkDatabaseHealth();
      const redisHealth = await checkRedisHealth();

      let status: "ok" | "degraded" | "error" = "ok";

      if (!dbHealth.connected) {
        status = "error";
      } else if (!redisHealth.connected) {
        status = "degraded";
      }

      return {
        status,
        timestamp: new Date().toISOString(),
        version: "2.0.0",
        uptime: process.uptime(),
        adapters: {
          enabled: appConfig.useRealAdapters,
          stt: appConfig.sttProvider,
          tts: appConfig.ttsProvider,
          guest: appConfig.guestProvider,
        },
        database: dbHealth,
        redis: redisHealth,
      };
    }
  );

  // Ready check endpoint (Kubernetes-style)
  server.get(
    "/ready",
    {
      schema: {
        tags: ["health"],
        description: "Readiness probe for orchestration systems",
      },
    },
    async (request, reply) => {
      const dbHealth = await checkDatabaseHealth();

      if (!dbHealth.connected) {
        reply.code(503);
        return { status: "not ready", reason: "database unavailable" };
      }

      return { status: "ready" };
    }
  );

  // Liveness check endpoint
  server.get(
    "/live",
    {
      schema: {
        tags: ["health"],
        description: "Liveness probe - always returns OK if server is running",
      },
    },
    async (request, reply) => {
      return { status: "alive" };
    }
  );

  // Metrics endpoint (Prometheus format)
  server.get(
    "/metrics",
    {
      schema: {
        tags: ["health"],
        description: "Prometheus-compatible metrics endpoint",
      },
    },
    async (request, reply) => {
      reply.header("Content-Type", "text/plain");
      return await getMetrics();
    }
  );

  // Root endpoint
  server.get("/", async (request, reply) => {
    return {
      name: "Basil Voice Studio API",
      version: "2.0.0",
      docs: "/docs",
      health: "/health",
      metrics: "/metrics",
    };
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  server.setErrorHandler(async (error, request, reply) => {
    // Log error
    logger.error(
      {
        err: error,
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      "Request error"
    );

    // Send to Sentry if configured
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        contexts: {
          request: {
            method: request.method,
            url: request.url,
            headers: request.headers,
          },
        },
      });
    }

    // Determine status code
    const statusCode = error.statusCode || 500;

    // Send error response
    reply.code(statusCode).send({
      error: error.name || "Internal Server Error",
      message: error.message || "An unexpected error occurred",
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  });

  // Not found handler
  server.setNotFoundHandler(async (request, reply) => {
    reply.code(404).send({
      error: "Not Found",
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  });

  return server;
}

/**
 * Start the server
 */
export async function startServer(): Promise<FastifyInstance> {
  const server = await createServer();

  try {
    // Connect to database
    await connectDatabase();

    // Start listening
    await server.listen({
      port: appConfig.port,
      host: "0.0.0.0",
    });

    logger.info(`✅ Fastify server listening on http://localhost:${appConfig.port}`);
    logger.info(`   API Documentation: http://localhost:${appConfig.port}/docs`);
    logger.info(`   Health check: http://localhost:${appConfig.port}/health`);
    logger.info(`   Metrics: http://localhost:${appConfig.port}/metrics`);

    return server;
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
export async function shutdownServer(
  server: FastifyInstance,
  signal: string
): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully...`);

  try {
    // Stop accepting new connections
    await server.close();
    logger.info("Fastify server closed");

    // Disconnect from database
    await disconnectDatabase();

    // Disconnect from Redis
    await disconnectRedis();

    // Flush Sentry events
    if (process.env.SENTRY_DSN) {
      await Sentry.close(2000);
    }

    logger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.fatal({ err: error }, "Error during shutdown");
    process.exit(1);
  }
}

// Extend FastifyRequest type for custom properties
declare module "fastify" {
  interface FastifyRequest {
    startTime?: number;
  }

  interface FastifyInstance {
    authenticate: any;
  }
}

export default { createServer, startServer, shutdownServer };
