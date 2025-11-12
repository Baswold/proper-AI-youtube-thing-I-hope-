/**
 * Authentication routes
 * Handles user registration, login, and JWT token management
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/database.js";
import { logger } from "../utils/logger.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "../validation/schemas.js";

export async function authRoutes(server: FastifyInstance) {
  /**
   * Register a new user
   */
  server.post(
    "/auth/register",
    {
      schema: {
        tags: ["auth"],
        description: "Register a new user account",
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            name: { type: "string" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  name: { type: "string" },
                  role: { type: "string" },
                },
              },
              token: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { email, password, name } = registerSchema.parse(request.body);

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          return reply.code(409).send({
            error: "Conflict",
            message: "User with this email already exists",
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            name,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        });

        // Generate JWT token
        const token = server.jwt.sign({
          id: user.id,
          email: user.email,
          role: user.role,
        });

        logger.info({ userId: user.id, email: user.email }, "User registered");

        reply.code(201).send({
          user,
          token,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            message: error.errors.map((e) => e.message).join(", "),
          });
        }

        logger.error({ err: error }, "Registration error");
        throw error;
      }
    }
  );

  /**
   * Login
   */
  server.post(
    "/auth/login",
    {
      schema: {
        tags: ["auth"],
        description: "Login with email and password",
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  name: { type: "string" },
                  role: { type: "string" },
                },
              },
              token: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { email, password } = loginSchema.parse(request.body);

        // Find user
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid email or password",
          });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.passwordHash);

        if (!validPassword) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid email or password",
          });
        }

        // Generate JWT token
        const token = server.jwt.sign({
          id: user.id,
          email: user.email,
          role: user.role,
        });

        logger.info({ userId: user.id, email: user.email }, "User logged in");

        reply.send({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          token,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            message: error.errors.map((e) => e.message).join(", "),
          });
        }

        logger.error({ err: error }, "Login error");
        throw error;
      }
    }
  );

  /**
   * Get current user (requires authentication)
   */
  server.get(
    "/auth/me",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["auth"],
        description: "Get current authenticated user",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  name: { type: "string" },
                  role: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const decoded = request.user as any;

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      if (!user) {
        return reply.code(404).send({
          error: "Not Found",
          message: "User not found",
        });
      }

      reply.send({ user });
    }
  );
}

// Note: For production, you should also implement:
// - Refresh tokens
// - Password reset
// - Email verification
// - Rate limiting on auth endpoints
// - CSRF protection
