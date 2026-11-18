import { randomUUID } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import type { DestinationStream } from "pino";
import type { AssistantConfig, Config } from "./infrastructure/config.js";
import type { Database } from "./infrastructure/database/index.js";
import { createSlotLimiter } from "./infrastructure/security/concurrency.js";
import { createRateLimiter } from "./infrastructure/security/rate-limit.js";
import {
  createAuthService,
  createRequestAuthenticator,
  registerAuthRoutes,
} from "./modules/auth/index.js";
import {
  createDealQueries,
  registerDealRoutes,
} from "./modules/deals/index.js";
import {
  createDocumentCommands,
  createDocumentMetadataReader,
  multipartLimits,
  registerDocumentRoutes,
} from "./modules/documents/index.js";
import {
  createAnthropicLlm,
  createAssistant,
  createRetrievalRepository,
  registerAssistantRoutes,
  type LlmClient,
} from "./modules/assistant/index.js";
import {
  createVoyageEmbedder,
  type Embedder,
} from "./modules/indexing/index.js";
import {
  createTeamQueries,
  registerTeamRoutes,
} from "./modules/teams/index.js";
import { HttpError, publicError } from "./infrastructure/errors.js";
import { createLogger } from "./infrastructure/logging.js";

export type AppDependencies = {
  /** Owned by the caller (server.ts disconnects it on shutdown). */
  database?: Database;
  now?: () => Date;
  /** Test hook to capture structured logs. */
  logDestination?: DestinationStream;
  /** Keys and limits of the assistant; without keys the route is absent. */
  assistantConfig?: AssistantConfig;
  /** Replaces the configured model and embedding clients (tests). */
  assistantClients?: { llm: LlmClient; embedder: Embedder };
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_KEYS = 10_000;
const MAX_CONCURRENT_UPLOADS = 2;

/** Composition root: wires modules; does not listen or open connections. */
export function createApp(config: Config, dependencies: AppDependencies = {}) {
  const app = Fastify({
    loggerInstance: createLogger(config.LOG_LEVEL, dependencies.logDestination),
    // Only the explicitly configured proxy chain may supply the client IP
    // (rate limiting keys); with no list the socket address is used.
    trustProxy:
      config.TRUSTED_PROXIES.length > 0 ? config.TRUSTED_PROXIES : false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    bodyLimit: 32_768,
    requestTimeout: 30_000,
    connectionTimeout: 30_000,
    logController: new LogController({ disableRequestLogging: true }),
  });
  void app.register(fastifyCookie);
  void app.register(fastifyMultipart, {
    limits: multipartLimits,
    throwFileSizeLimit: true,
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      request.headers.origin !== config.PUBLIC_ORIGIN
    ) {
      throw new HttpError("FORBIDDEN");
    }
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? "unmatched",
        statusCode: reply.statusCode,
      },
      "Request completed",
    );
  });
  app.setNotFoundHandler(() => {
    throw new HttpError("NOT_FOUND");
  });
  app.setErrorHandler((error, request, reply) => {
    const safe = publicError(error);
    if (safe.statusCode === 500)
      request.log.error({ code: "INTERNAL_ERROR" }, "Request failed");
    if (safe.retryAfter !== undefined)
      reply.header("Retry-After", safe.retryAfter);
    void reply
      .code(safe.statusCode)
      .send({ code: safe.code, message: safe.message });
  });
  if (dependencies.database)
    registerModules(app, config, {
      database: dependencies.database,
      now: dependencies.now ?? (() => new Date()),
      assistantClients: dependencies.assistantClients,
      assistantConfig: dependencies.assistantConfig,
    });
  return app;
}

function registerModules(
  app: FastifyInstance,
  config: Config,
  {
    database,
    now,
    assistantClients,
    assistantConfig,
  }: {
    database: Database;
    now: () => Date;
    assistantClients: AppDependencies["assistantClients"];
    assistantConfig: AssistantConfig | undefined;
  },
) {
  const auth = createAuthService({
    database,
    sessionTtlSeconds: config.SESSION_TTL_SECONDS,
    now,
  });
  const authenticate = createRequestAuthenticator(auth);
  const clock = () => now().getTime();
  registerAuthRoutes(app, {
    auth,
    cookie: { secure: new URL(config.PUBLIC_ORIGIN).protocol === "https:" },
    sessionTtlSeconds: config.SESSION_TTL_SECONDS,
    loginLimiter: createRateLimiter({
      limit: 10,
      windowMs: LOGIN_WINDOW_MS,
      maxKeys: RATE_LIMIT_KEYS,
      now: clock,
    }),
    ipLimiter: createRateLimiter({
      limit: 100,
      windowMs: LOGIN_WINDOW_MS,
      maxKeys: RATE_LIMIT_KEYS,
      now: clock,
    }),
  });
  const documents = createDocumentMetadataReader({ database });
  const deals = createDealQueries({
    database,
    listDocumentMetadata: (dealId) => documents.listDocumentMetadata(dealId),
  });
  const teams = createTeamQueries({ database });
  registerDealRoutes(app, { deals, authenticate });
  registerTeamRoutes(app, { teams, authenticate });
  registerDocumentRoutes(app, {
    authenticate,
    documents: createDocumentCommands({
      database,
      getAccessibleDealScope: (userId, dealId) =>
        deals.getAccessibleDealScope(userId, dealId),
      getAccessibleTeamScope: (userId, teamId) =>
        teams.getAccessibleTeamScope(userId, teamId),
    }),
    uploadSlots: createSlotLimiter(MAX_CONCURRENT_UPLOADS),
  });
  const keys =
    assistantConfig?.ANTHROPIC_API_KEY && assistantConfig.VOYAGE_API_KEY
      ? {
          anthropic: assistantConfig.ANTHROPIC_API_KEY,
          voyage: assistantConfig.VOYAGE_API_KEY,
        }
      : undefined;
  const clients =
    assistantClients ??
    (assistantConfig && keys
      ? {
          llm: createAnthropicLlm(keys.anthropic),
          embedder: createVoyageEmbedder({
            apiKey: keys.voyage,
            model: assistantConfig.EMBEDDING_MODEL,
            dimensions: assistantConfig.EMBEDDING_DIMENSIONS,
          }),
        }
      : undefined);
  // Without keys the assistant route is simply absent (404), never half-working.
  if (clients)
    registerAssistantRoutes(app, {
      authenticate,
      limiter: createRateLimiter({
        limit: assistantConfig?.ASSISTANT_REQUESTS_PER_MINUTE ?? 20,
        windowMs: 60_000,
        maxKeys: RATE_LIMIT_KEYS,
        now: clock,
      }),
      assistant: createAssistant({
        llm: clients.llm,
        model: assistantConfig?.ASSISTANT_MODEL ?? "claude-haiku-5-5",
        embedder: clients.embedder,
        repository: createRetrievalRepository(database),
        maxSteps: assistantConfig?.ASSISTANT_MAX_STEPS ?? 20,
        now,
        getTeamScope: (userId, teamId) =>
          teams.getAccessibleTeamScope(userId, teamId),
      }),
    });
}
