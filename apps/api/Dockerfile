# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/prisma-client/package.json ./packages/prisma-client/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/prisma-client ./packages/prisma-client
COPY apps/api ./apps/api
COPY turbo.json ./

# Generate Prisma client
RUN pnpm --filter @gdkp/prisma-client generate

# Build packages
RUN pnpm --filter @gdkp/shared build
RUN pnpm --filter @gdkp/api build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "cd packages/prisma-client && npx prisma migrate deploy && cd /app && node apps/api/dist/index.js"]
