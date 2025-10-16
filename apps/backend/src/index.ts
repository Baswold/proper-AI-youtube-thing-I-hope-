import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { ProductionOrchestrator } from "./orchestrator-v2.js";
import type { ClientToServerEvents, ServerToClientEvents } from "@basil/shared";
import { appConfig, validateConfig, printConfig } from "./config.js";

// Validate configuration on startup
try {
  validateConfig();
  printConfig();
} catch (error) {
  console.error("Fatal configuration error:", error);
  process.exit(1);
}

const app = express();
app.use(cors({
  origin: appConfig.corsOrigin,
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    adapters: {
      enabled: appConfig.useRealAdapters,
      stt: appConfig.sttProvider,
      tts: appConfig.ttsProvider,
      guest: appConfig.guestProvider,
    },
  });
});

// Ready check endpoint
app.get("/ready", (_req, res) => {
  res.json({ status: "ready" });
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: appConfig.corsOrigin,
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const orchestrator = new ProductionOrchestrator({
  useRealAdapters: appConfig.useRealAdapters,
  recordingDir: appConfig.recordingDir,
});

io.on("connection", async (socket) => {
  console.info(`[server] new connection: ${socket.id}`);
  
  try {
    await orchestrator.register(socket);
  } catch (error) {
    console.error(`[server] failed to register socket ${socket.id}:`, error);
    socket.disconnect(true);
  }
});

// Error handling
io.on("error", (error) => {
  console.error("[server] Socket.IO error:", error);
});

const server = httpServer.listen(appConfig.port, () => {
  console.info(`✅ Backend listening on http://localhost:${appConfig.port}`);
  console.info(`   WebSocket ready for connections`);
  console.info(`   Health check: http://localhost:${appConfig.port}/health`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.info(`\n[server] ${signal} received, shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.info("[server] HTTP server closed");
    
    try {
      // Cleanup orchestrator and active sessions
      await orchestrator.shutdown();
      console.info("[server] Orchestrator shutdown complete");
      
      // Close Socket.IO
      io.close(() => {
        console.info("[server] Socket.IO closed");
        process.exit(0);
      });
    } catch (error) {
      console.error("[server] Error during shutdown:", error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error("[server] Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[server] Uncaught exception:", error);
  shutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[server] Unhandled rejection at:", promise, "reason:", reason);
  shutdown("UNHANDLED_REJECTION");
});
