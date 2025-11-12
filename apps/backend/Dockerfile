# Multi-stage Docker build for Basil Backend
# Optimized for production with minimal image size

# ============================================================================
# Stage 1: Dependencies
# ============================================================================
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# ============================================================================
# Stage 2: Builder
# ============================================================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source code
COPY . .

# Generate Prisma Client
WORKDIR /app/apps/backend
RUN pnpm db:generate

# Build the application
RUN pnpm build

# ============================================================================
# Stage 3: Production Runtime
# ============================================================================
FROM node:20-alpine AS runtime

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY --chown=nodejs:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=nodejs:nodejs apps/backend/package.json ./apps/backend/
COPY --chown=nodejs:nodejs packages/shared/package.json ./packages/shared/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --chown=nodejs:nodejs --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --chown=nodejs:nodejs --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --chown=nodejs:nodejs --from=builder /app/apps/backend/node_modules/.prisma ./apps/backend/node_modules/.prisma
COPY --chown=nodejs:nodejs --from=builder /app/packages/shared ./packages/shared

# Create directories for recordings and logs
RUN mkdir -p /app/recordings /app/logs && \
    chown -R nodejs:nodejs /app/recordings /app/logs

# Switch to non-root user
USER nodejs

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "apps/backend/dist/index.js"]
