# syntax=docker/dockerfile:1
# Fastify API: compiled JavaScript on Node 24. Build from the repository root:
#   docker build -f apps/api/Dockerfile .
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY . .
# HUSKY=0: no Git hooks in images. Prisma generate needs a syntactically valid
# URL only; it never connects during build.
ENV HUSKY=0
RUN pnpm install --frozen-lockfile \
 && DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm --filter @agency/api db:generate \
 && pnpm --filter @agency/config --filter @agency/contracts build \
 && pnpm --filter @agency/api build

FROM node:24-slim AS runtime
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
ENV NODE_ENV=production
# The workspace node_modules (incl. Prisma CLI for the explicit migrate
# command) and compiled output only; no sources are executed by tsx.
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 3001
# Migrations are a separate, explicit command (see docs/operations.md);
# the server never migrates or resets on startup.
CMD ["node", "apps/api/dist/server.js"]
