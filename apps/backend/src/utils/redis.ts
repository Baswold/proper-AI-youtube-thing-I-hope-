/**
 * Redis client for caching and session management
 * Provides typed cache operations with automatic serialization/deserialization
 */

import Redis from "ioredis";
import { logger } from "./logger.js";
import {
  cacheHitsTotal,
  cacheMissesTotal,
  cacheOperationDuration,
} from "./metrics.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false";

// Create Redis client
export const redis = REDIS_ENABLED
  ? new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    })
  : null;

// Redis event handlers
if (redis) {
  redis.on("connect", () => {
    logger.info("Redis client connecting");
  });

  redis.on("ready", () => {
    logger.info("Redis client ready");
  });

  redis.on("error", (err) => {
    logger.error({ err }, "Redis client error");
  });

  redis.on("close", () => {
    logger.warn("Redis client connection closed");
  });

  redis.on("reconnecting", () => {
    logger.info("Redis client reconnecting");
  });
}

/**
 * Default cache TTL (1 hour)
 */
const DEFAULT_TTL = 60 * 60;

/**
 * Cache service with typed operations
 */
export class CacheService {
  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!redis) return null;

    const start = Date.now();
    try {
      const value = await redis.get(key);

      const duration = (Date.now() - start) / 1000;
      cacheOperationDuration.observe(
        { operation: "get", cache_type: "redis" },
        duration
      );

      if (value === null) {
        cacheMissesTotal.inc({ cache_type: "redis" });
        return null;
      }

      cacheHitsTotal.inc({ cache_type: "redis" });
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error({ err: error, key }, "Failed to get from cache");
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttl: number = DEFAULT_TTL): Promise<void> {
    if (!redis) return;

    const start = Date.now();
    try {
      const serialized = JSON.stringify(value);
      await redis.setex(key, ttl, serialized);

      const duration = (Date.now() - start) / 1000;
      cacheOperationDuration.observe(
        { operation: "set", cache_type: "redis" },
        duration
      );
    } catch (error) {
      logger.error({ err: error, key }, "Failed to set cache");
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    if (!redis) return;

    const start = Date.now();
    try {
      await redis.del(key);

      const duration = (Date.now() - start) / 1000;
      cacheOperationDuration.observe(
        { operation: "delete", cache_type: "redis" },
        duration
      );
    } catch (error) {
      logger.error({ err: error, key }, "Failed to delete from cache");
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!redis) return 0;

    try {
      const keys = await redis.keys(pattern);
      if (keys.length === 0) return 0;

      await redis.del(...keys);
      return keys.length;
    } catch (error) {
      logger.error({ err: error, pattern }, "Failed to delete pattern");
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!redis) return false;

    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ err: error, key }, "Failed to check existence");
      return false;
    }
  }

  /**
   * Increment a counter
   */
  async increment(key: string, by: number = 1): Promise<number> {
    if (!redis) return 0;

    try {
      return await redis.incrby(key, by);
    } catch (error) {
      logger.error({ err: error, key }, "Failed to increment");
      return 0;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    if (!redis) return -1;

    try {
      return await redis.ttl(key);
    } catch (error) {
      logger.error({ err: error, key }, "Failed to get TTL");
      return -1;
    }
  }

  /**
   * Get multiple values at once
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    if (!redis || keys.length === 0) return [];

    try {
      const values = await redis.mget(...keys);
      return values.map((v) => (v ? (JSON.parse(v) as T) : null));
    } catch (error) {
      logger.error({ err: error, keys }, "Failed to mget from cache");
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values at once
   */
  async mset(entries: Record<string, any>, ttl: number = DEFAULT_TTL): Promise<void> {
    if (!redis || Object.keys(entries).length === 0) return;

    try {
      const pipeline = redis.pipeline();

      for (const [key, value] of Object.entries(entries)) {
        const serialized = JSON.stringify(value);
        pipeline.setex(key, ttl, serialized);
      }

      await pipeline.exec();
    } catch (error) {
      logger.error({ err: error }, "Failed to mset cache");
    }
  }
}

/**
 * Singleton cache service instance
 */
export const cache = new CacheService();

/**
 * Health check for Redis
 */
export async function checkRedisHealth(): Promise<{
  connected: boolean;
  latency?: number;
}> {
  if (!redis) {
    return { connected: false };
  }

  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    return {
      connected: true,
      latency,
    };
  } catch (error) {
    logger.error({ err: error }, "Redis health check failed");
    return {
      connected: false,
    };
  }
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    logger.info("Redis client disconnected");
  }
}

/**
 * Cache key builders for consistency
 */
export const CacheKeys = {
  session: (sessionId: string) => `session:${sessionId}`,
  user: (userId: string) => `user:${userId}`,
  llmResponse: (hash: string) => `llm:${hash}`,
  ttsAudio: (hash: string) => `tts:${hash}`,
  metrics: (sessionId: string) => `metrics:${sessionId}`,
  rateLimit: (identifier: string) => `ratelimit:${identifier}`,
} as const;

export default cache;
