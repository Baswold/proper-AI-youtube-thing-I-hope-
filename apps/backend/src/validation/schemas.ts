/**
 * Zod validation schemas for API endpoints and WebSocket events
 * Provides type-safe runtime validation with helpful error messages
 */

import { z } from "zod";

// ============================================================================
// Authentication Schemas
// ============================================================================

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// ============================================================================
// Session Schemas
// ============================================================================

export const createSessionSchema = z.object({
  episodeId: z.string().optional(),
  participantName: z.string().optional(),
  autopilot: z.boolean().optional().default(false),
});

export const sessionIdSchema = z.object({
  sessionId: z.string().cuid("Invalid session ID format"),
});

export const sessionQuerySchema = z.object({
  status: z.enum(["ACTIVE", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  sortBy: z.enum(["startedAt", "duration", "createdAt"]).default("startedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ============================================================================
// WebSocket Event Schemas
// ============================================================================

export const helloEventSchema = z.object({
  episodeId: z.string().optional(),
  participantName: z.string().optional(),
});

export const audioChunkSchema = z.object({
  chunk: z.instanceof(ArrayBuffer, {
    message: "Audio chunk must be an ArrayBuffer",
  }),
  speaker: z.enum(["you", "claude", "guest"]).optional(),
});

export const toggleAutopilotSchema = z.object({
  enabled: z.boolean(),
});

export const orbStateSchema = z.object({
  speaker: z.enum(["you", "claude", "guest"]),
  state: z.enum(["idle", "listening", "thinking", "talking"]),
});

export const captionSchema = z.object({
  speaker: z.enum(["you", "claude", "guest"]),
  text: z.string().min(1, "Caption text cannot be empty"),
  timestamp: z.number().nonnegative(),
  isFinal: z.boolean().optional().default(true),
});

// ============================================================================
// Recording Schemas
// ============================================================================

export const recordingQuerySchema = z.object({
  sessionId: z.string().cuid().optional(),
  speaker: z.enum(["you", "claude", "guest"]).optional(),
  fileType: z.enum(["AUDIO", "CAPTION", "EVENT_LOG", "METADATA"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const deleteRecordingSchema = z.object({
  recordingId: z.string().cuid("Invalid recording ID format"),
});

// ============================================================================
// Analytics Schemas
// ============================================================================

export const analyticsQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
});

export const metricsSessionIdSchema = z.object({
  sessionId: z.string().cuid("Invalid session ID format"),
});

// ============================================================================
// Configuration Schemas
// ============================================================================

export const providerConfigSchema = z.object({
  sttProvider: z.enum(["assemblyai", "google", "whisper"]).optional(),
  ttsProvider: z.enum(["google", "piper"]).optional(),
  guestProvider: z.enum(["groq", "together", "openai", "local"]).optional(),
});

// ============================================================================
// Health Check Schemas
// ============================================================================

export const healthCheckResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime: z.number().nonnegative(),
  adapters: z.object({
    enabled: z.boolean(),
    stt: z.string(),
    tts: z.string(),
    guest: z.string(),
  }),
  database: z.object({
    connected: z.boolean(),
    latency: z.number().optional(),
  }).optional(),
  redis: z.object({
    connected: z.boolean(),
    latency: z.number().optional(),
  }).optional(),
});

// ============================================================================
// Error Response Schema
// ============================================================================

export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number().int(),
  timestamp: z.string().datetime(),
  path: z.string().optional(),
  details: z.any().optional(),
});

// ============================================================================
// Pagination Schema
// ============================================================================

export const paginationSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

// ============================================================================
// Type exports for TypeScript
// ============================================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SessionQueryInput = z.infer<typeof sessionQuerySchema>;
export type HelloEventInput = z.infer<typeof helloEventSchema>;
export type AudioChunkInput = z.infer<typeof audioChunkSchema>;
export type ToggleAutopilotInput = z.infer<typeof toggleAutopilotSchema>;
export type OrbStateInput = z.infer<typeof orbStateSchema>;
export type CaptionInput = z.infer<typeof captionSchema>;
export type RecordingQueryInput = z.infer<typeof recordingQuerySchema>;
export type DeleteRecordingInput = z.infer<typeof deleteRecordingSchema>;
export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
export type ProviderConfigInput = z.infer<typeof providerConfigSchema>;
export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
