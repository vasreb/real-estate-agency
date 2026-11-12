import { loginSchema } from "@agency/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "../../../infrastructure/errors.js";
import type { RateLimiter } from "../../../infrastructure/security/rate-limit.js";
import type { AuthService } from "../application/auth-service.js";
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
  type CookieSettings,
} from "./session-cookie.js";

export type AuthRouteOptions = {
  auth: AuthService;
  cookie: CookieSettings;
  sessionTtlSeconds: number;
  /** Per IP + normalized email. */
  loginLimiter: RateLimiter;
  /** Aggregate per IP. */
  ipLimiter: RateLimiter;
};

function enforce(limiter: RateLimiter, key: string) {
  const result = limiter.hit(key);
  if (!result.allowed)
    throw new HttpError("RATE_LIMITED", result.retryAfterSeconds);
}

/** The socket address only: trustProxy is off, forwarding headers are ignored. */
const clientIp = (request: FastifyRequest) => request.ip;

export function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
) {
  app.post("/api/auth/login", async (request, reply) => {
    const ip = clientIp(request);
    enforce(options.ipLimiter, ip);
    const body = loginSchema.parse(request.body);
    enforce(options.loginLimiter, `${ip}\u0000${body.email}`);
    const session = await options.auth.login(body.email, body.password);
    if (!session) throw new HttpError("UNAUTHENTICATED");
    setSessionCookie(
      reply,
      options.cookie,
      session.token,
      options.sessionTtlSeconds,
    );
    return reply.code(204).send();
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = readSessionToken(request);
    if (token) await options.auth.logout(token);
    clearSessionCookie(reply, options.cookie);
    return reply.code(204).send();
  });
}

/** Resolves the current user or throws 401; used before any resource lookup. */
export function createRequestAuthenticator(auth: AuthService) {
  return async (request: FastifyRequest): Promise<{ userId: string }> => {
    const token = readSessionToken(request);
    const user = token ? await auth.authenticate(token) : null;
    if (!user) throw new HttpError("UNAUTHENTICATED");
    return user;
  };
}
export type RequestAuthenticator = ReturnType<
  typeof createRequestAuthenticator
>;
