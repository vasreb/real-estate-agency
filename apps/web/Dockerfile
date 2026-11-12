# syntax=docker/dockerfile:1
# Next.js production server. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://api:3001 .
# API_INTERNAL_URL is baked into the /api rewrites at build time.
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=${API_INTERNAL_URL} HUSKY=0 NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @agency/config --filter @agency/contracts --filter @agency/ui build \
 && pnpm --filter @agency/web build

FROM node:24-slim AS runtime
WORKDIR /repo/apps/web
ARG API_INTERNAL_URL=http://api:3001
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=${API_INTERNAL_URL}
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 3000
# server.mjs wraps Next and sets an honest X-Forwarded-For (see forwarding.mjs).
CMD ["node", "server.mjs", "--hostname", "0.0.0.0", "--port", "3000"]
