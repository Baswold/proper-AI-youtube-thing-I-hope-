/**
 * Prometheus metrics for monitoring application performance
 * Tracks HTTP requests, WebSocket connections, LLM/TTS usage, and custom business metrics
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

// Create a new registry
export const register = new Registry();

// Collect default metrics (CPU, memory, event loop lag, etc.)
collectDefaultMetrics({ register });

// ============================================================================
// HTTP Metrics
// ============================================================================

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// ============================================================================
// WebSocket Metrics
// ============================================================================

export const websocketConnections = new Gauge({
  name: "websocket_connections_active",
  help: "Number of active WebSocket connections",
  registers: [register],
});

export const websocketMessagesTotal = new Counter({
  name: "websocket_messages_total",
  help: "Total number of WebSocket messages",
  labelNames: ["event_type", "direction"], // direction: inbound/outbound
  registers: [register],
});

export const websocketMessageDuration = new Histogram({
  name: "websocket_message_duration_seconds",
  help: "Duration of WebSocket message processing in seconds",
  labelNames: ["event_type"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// ============================================================================
// Session Metrics
// ============================================================================

export const sessionsActive = new Gauge({
  name: "sessions_active",
  help: "Number of active recording sessions",
  registers: [register],
});

export const sessionsTotal = new Counter({
  name: "sessions_total",
  help: "Total number of sessions created",
  labelNames: ["status"], // status: completed/failed/cancelled
  registers: [register],
});

export const sessionDuration = new Histogram({
  name: "session_duration_seconds",
  help: "Duration of recording sessions in seconds",
  labelNames: ["status"],
  buckets: [60, 300, 600, 1200, 1800, 3600], // 1min, 5min, 10min, 20min, 30min, 1hr
  registers: [register],
});

// ============================================================================
// LLM Metrics
// ============================================================================

export const llmRequestsTotal = new Counter({
  name: "llm_requests_total",
  help: "Total number of LLM API requests",
  labelNames: ["provider", "model", "status"], // status: success/error
  registers: [register],
});

export const llmRequestDuration = new Histogram({
  name: "llm_request_duration_seconds",
  help: "Duration of LLM API requests in seconds",
  labelNames: ["provider", "model"],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const llmTokensTotal = new Counter({
  name: "llm_tokens_total",
  help: "Total number of LLM tokens consumed",
  labelNames: ["provider", "model", "type"], // type: input/output
  registers: [register],
});

export const llmCostTotal = new Counter({
  name: "llm_cost_dollars_total",
  help: "Total estimated LLM cost in USD",
  labelNames: ["provider", "model"],
  registers: [register],
});

// ============================================================================
// TTS Metrics
// ============================================================================

export const ttsRequestsTotal = new Counter({
  name: "tts_requests_total",
  help: "Total number of TTS API requests",
  labelNames: ["provider", "voice", "status"],
  registers: [register],
});

export const ttsRequestDuration = new Histogram({
  name: "tts_request_duration_seconds",
  help: "Duration of TTS API requests in seconds",
  labelNames: ["provider", "voice"],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const ttsCharactersTotal = new Counter({
  name: "tts_characters_total",
  help: "Total number of characters converted to speech",
  labelNames: ["provider", "voice"],
  registers: [register],
});

export const ttsCostTotal = new Counter({
  name: "tts_cost_dollars_total",
  help: "Total estimated TTS cost in USD",
  labelNames: ["provider", "voice"],
  registers: [register],
});

// ============================================================================
// STT Metrics
// ============================================================================

export const sttRequestsTotal = new Counter({
  name: "stt_requests_total",
  help: "Total number of STT API requests",
  labelNames: ["provider", "status"],
  registers: [register],
});

export const sttRequestDuration = new Histogram({
  name: "stt_request_duration_seconds",
  help: "Duration of STT API requests in seconds",
  labelNames: ["provider"],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const sttAudioDuration = new Counter({
  name: "stt_audio_duration_seconds_total",
  help: "Total duration of audio transcribed in seconds",
  labelNames: ["provider"],
  registers: [register],
});

export const sttCostTotal = new Counter({
  name: "stt_cost_dollars_total",
  help: "Total estimated STT cost in USD",
  labelNames: ["provider"],
  registers: [register],
});

// ============================================================================
// Database Metrics
// ============================================================================

export const dbQueryDuration = new Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "table"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const dbQueryTotal = new Counter({
  name: "db_queries_total",
  help: "Total number of database queries",
  labelNames: ["operation", "table", "status"],
  registers: [register],
});

// ============================================================================
// Cache Metrics
// ============================================================================

export const cacheHitsTotal = new Counter({
  name: "cache_hits_total",
  help: "Total number of cache hits",
  labelNames: ["cache_type"], // cache_type: redis/memory
  registers: [register],
});

export const cacheMissesTotal = new Counter({
  name: "cache_misses_total",
  help: "Total number of cache misses",
  labelNames: ["cache_type"],
  registers: [register],
});

export const cacheOperationDuration = new Histogram({
  name: "cache_operation_duration_seconds",
  help: "Duration of cache operations in seconds",
  labelNames: ["operation", "cache_type"], // operation: get/set/delete
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
  registers: [register],
});

// ============================================================================
// Error Metrics
// ============================================================================

export const errorsTotal = new Counter({
  name: "errors_total",
  help: "Total number of errors",
  labelNames: ["type", "severity"], // severity: warning/error/fatal
  registers: [register],
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

export default {
  register,
  getMetrics,
  resetMetrics,
};
