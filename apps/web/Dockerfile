FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/theme/package.json ./packages/theme/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/api-client/ ./packages/api-client/
COPY packages/theme/ ./packages/theme/
COPY apps/web/ ./apps/web/
RUN pnpm --filter @pulse/web build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html/pulse
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
