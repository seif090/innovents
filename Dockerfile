# ==============================================================================
# Stage 1: Build & Compilation
# ==============================================================================
FROM node:24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache openssl

# Install npm dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy source code and build
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build
RUN npm prune --production

# ==============================================================================
# Stage 2: Production Runtime
# ==============================================================================
FROM node:24-alpine AS runner

WORKDIR /app

# Install production runtime dependencies
RUN apk add --no-cache openssl curl

# Create non-root user
USER node

# Copy built application and production dependencies
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

CMD ["node", "dist/main.js"]
