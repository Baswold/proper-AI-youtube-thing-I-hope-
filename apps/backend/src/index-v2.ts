/**
 * Main entry point for the Basil Voice Studio backend (v2)
 * Integrates Fastify HTTP server with Socket.IO for WebSocket communication
 */

import { createServer as createHttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@basil/shared";
import { createServer, shutdownServer } from "./server.js";
import { ProductionOrchestrator } from "./orchestrator-v2.js";
import { appConfig, validateConfig, printConfig } from "./config.js";
import { logger } from "./utils/logger.js";
import { websocketConnections, websocketMessagesTotal } from "./utils/metrics.js";
import * as Sentry from "@sentry/node";

// Validate configuration on startup
try {
  validateConfig();
  printConfig();
} catch (error) {
  logger.fatal({ err: error }, "Fatal configuration error");
  process.exit(1);
}

/**
 * Start the application
 */
async function main() {
  try {
    // Create Fastify server
    const fastifyServer = await createServer();

    // Get underlying HTTP server
    await fastifyServer.ready();
    const httpServer = fastifyServer.server;

    // Create Socket.IO server
    const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
      httpServer,
      {
        cors: {
          origin: appConfig.corsOrigin,
          credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ["websocket", "polling"],
      }
    );

    // Create orchestrator
    const orchestrator = new ProductionOrchestrator({
      useRealAdapters: appConfig.useRealAdapters,
      recordingDir: appConfig.recordingDir,
    });

    // Socket.IO middleware for authentication (optional)
    io.use(async (socket, next) => {
      try {
        // You can implement JWT authentication here if needed
        // const token = socket.handshake.auth.token;
        // await verifyToken(token);
        next();
      } catch (error) {
        logger.error({ err: error, socketId: socket.id }, "Socket authentication failed");
        next(error as Error);
      }
    });

    // Handle WebSocket connections
    io.on("connection", async (socket) => {
      logger.info({ socketId: socket.id }, "New WebSocket connection");
      websocketConnections.inc();

      try {
        await orchestrator.register(socket);
      } catch (error) {
        logger.error(
          { err: error, socketId: socket.id },
          "Failed to register socket"
        );

        if (process.env.SENTRY_DSN) {
          Sentry.captureException(error);
        }

        socket.disconnect(true);
      }

      // Track message metrics
      socket.onAny((eventName) => {
        websocketMessagesTotal.inc({
          event_type: eventName,
          direction: "inbound",
        });
      });

      // Handle disconnection
      socket.on("disconnect", (reason) => {
        logger.info(
          { socketId: socket.id, reason },
          "WebSocket disconnected"
        );
        websocketConnections.dec();
      });

      socket.on("error", (error) => {
        logger.error({ err: error, socketId: socket.id }, "Socket error");

        if (process.env.SENTRY_DSN) {
          Sentry.captureException(error);
        }
      });
    });

    // Start the server
    await fastifyServer.listen({
      port: appConfig.port,
      host: "0.0.0.0",
    });

    logger.info(`✅ Backend v2 listening on http://localhost:${appConfig.port}`);
    logger.info(`   WebSocket server ready`);
    logger.info(`   API Documentation: http://localhost:${appConfig.port}/docs`);
    logger.info(`   Health check: http://localhost:${appConfig.port}/health`);
    logger.info(`   Metrics: http://localhost:${appConfig.port}/metrics`);

    // ============================================================================
    // Graceful Shutdown
    // ============================================================================

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      try {
        // Close Socket.IO
        io.close(() => {
          logger.info("Socket.IO server closed");
        });

        // Cleanup orchestrator
        await orchestrator.shutdown();
        logger.info("Orchestrator shutdown complete");

        // Shutdown Fastify server (includes database and Redis)
        await shutdownServer(fastifyServer, signal);
      } catch (error) {
        logger.fatal({ err: error }, "Error during shutdown");
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.fatal({ err: error }, "Uncaught exception");

      if (process.env.SENTRY_DSN) {
        Sentry.captureException(error);
      }

      shutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.fatal(
        { reason, promise },
        "Unhandled rejection"
      );

      if (process.env.SENTRY_DSN) {
        Sentry.captureException(reason);
      }

      shutdown("UNHANDLED_REJECTION");
    });
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start application");
    process.exit(1);
  }
}

// Start the application
main();
