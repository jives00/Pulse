FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/server/package.json ./apps/server/
COPY packages/api-client/package.json ./packages/api-client/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/api-client/ ./packages/api-client/
COPY apps/server/ ./apps/server/
RUN pnpm --filter @pulse/server build

# Produce a standalone deploy bundle — resolves workspace symlinks into real node_modules
RUN pnpm deploy --filter @pulse/server --prod /deploy

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
