/**
 * Session management routes
 * Handles listing, creating, and managing recording sessions
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../utils/database.js";
import { logger } from "../utils/logger.js";
import { sessionQuerySchema, sessionIdSchema } from "../validation/schemas.js";

export async function sessionRoutes(server: FastifyInstance) {
  /**
   * List sessions with pagination and filtering
   */
  server.get(
    "/sessions",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["sessions"],
        description: "List recording sessions with pagination and filtering",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ACTIVE", "COMPLETED", "FAILED", "CANCELLED"] },
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "number", minimum: 0, default: 0 },
            sortBy: { type: "string", enum: ["startedAt", "duration", "createdAt"], default: "startedAt" },
            sortOrder: { type: "string", enum: ["asc", "desc"], default: "desc" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              sessions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    sessionId: { type: "string" },
                    episodeId: { type: "string" },
                    status: { type: "string" },
                    sttProvider: { type: "string" },
                    ttsProvider: { type: "string" },
                    guestProvider: { type: "string" },
                    autopilot: { type: "boolean" },
                    startedAt: { type: "string" },
                    endedAt: { type: "string" },
                    duration: { type: "number" },
                  },
                },
              },
              pagination: {
                type: "object",
                properties: {
                  total: { type: "number" },
                  limit: { type: "number" },
                  offset: { type: "number" },
                  hasMore: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = sessionQuerySchema.parse(request.query);
        const user = request.user as any;

        const where = {
          userId: user.id,
          ...(query.status && { status: query.status }),
        };

        const [sessions, total] = await Promise.all([
          prisma.session.findMany({
            where,
            orderBy: {
              [query.sortBy]: query.sortOrder,
            },
            skip: query.offset,
            take: query.limit,
            select: {
              id: true,
              sessionId: true,
              episodeId: true,
              status: true,
              sttProvider: true,
              ttsProvider: true,
              guestProvider: true,
              autopilot: true,
              startedAt: true,
              endedAt: true,
              duration: true,
            },
          }),
          prisma.session.count({ where }),
        ]);

        reply.send({
          sessions,
          pagination: {
            total,
            limit: query.limit,
            offset: query.offset,
            hasMore: query.offset + query.limit < total,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            message: error.errors.map((e) => e.message).join(", "),
          });
        }

        logger.error({ err: error }, "Error listing sessions");
        throw error;
      }
    }
  );

  /**
   * Get session by ID
   */
  server.get(
    "/sessions/:sessionId",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["sessions"],
        description: "Get a specific session by ID",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              sessionId: { type: "string" },
              episodeId: { type: "string" },
              status: { type: "string" },
              sttProvider: { type: "string" },
              ttsProvider: { type: "string" },
              guestProvider: { type: "string" },
              autopilot: { type: "boolean" },
              startedAt: { type: "string" },
              endedAt: { type: "string" },
              duration: { type: "number" },
              recordings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    speaker: { type: "string" },
                    fileType: { type: "string" },
                    filePath: { type: "string" },
                    fileSize: { type: "number" },
                    duration: { type: "number" },
                  },
                },
              },
              captions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    speaker: { type: "string" },
                    text: { type: "string" },
                    startTime: { type: "number" },
                    wordCount: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as any;
      const { sessionId } = request.params as { sessionId: string };

      const session = await prisma.session.findFirst({
        where: {
          sessionId,
          userId: user.id,
        },
        include: {
          recordings: {
            select: {
              id: true,
              speaker: true,
              fileType: true,
              filePath: true,
              fileSize: true,
              duration: true,
            },
          },
          captions: {
            select: {
              speaker: true,
              text: true,
              startTime: true,
              wordCount: true,
            },
            orderBy: {
              startTime: "asc",
            },
          },
        },
      });

      if (!session) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Session not found",
        });
      }

      reply.send(session);
    }
  );

  /**
   * Get session metrics
   */
  server.get(
    "/sessions/:sessionId/metrics",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["analytics"],
        description: "Get detailed metrics for a session",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as any;
      const { sessionId } = request.params as { sessionId: string };

      // Find session
      const session = await prisma.session.findFirst({
        where: {
          sessionId,
          userId: user.id,
        },
      });

      if (!session) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Session not found",
        });
      }

      // Get metrics (if they exist)
      const metrics = await prisma.sessionMetrics.findUnique({
        where: {
          sessionId: session.id,
        },
      });

      if (!metrics) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Metrics not yet available for this session",
        });
      }

      reply.send(metrics);
    }
  );

  /**
   * Delete session
   */
  server.delete(
    "/sessions/:sessionId",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["sessions"],
        description: "Delete a session and all associated recordings",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as any;
      const { sessionId } = request.params as { sessionId: string };

      const session = await prisma.session.findFirst({
        where: {
          sessionId,
          userId: user.id,
        },
      });

      if (!session) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Session not found",
        });
      }

      // Delete session (cascade will delete related records)
      await prisma.session.delete({
        where: {
          id: session.id,
        },
      });

      logger.info({ sessionId, userId: user.id }, "Session deleted");

      reply.send({
        message: "Session deleted successfully",
      });
    }
  );
}
