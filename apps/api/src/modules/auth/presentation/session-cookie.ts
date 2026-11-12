import { SESSION_COOKIE } from "@agency/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

export type CookieSettings = { secure: boolean };

const baseAttributes = (settings: CookieSettings) =>
  ({
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: settings.secure,
  }) as const;

export function setSessionCookie(
  reply: FastifyReply,
  settings: CookieSettings,
  token: string,
  maxAgeSeconds: number,
) {
  void reply.setCookie(SESSION_COOKIE, token, {
    ...baseAttributes(settings),
    maxAge: maxAgeSeconds,
  });
}

/** Clears with the same Path/HttpOnly/SameSite/Secure attributes as set. */
export function clearSessionCookie(
  reply: FastifyReply,
  settings: CookieSettings,
) {
  void reply.clearCookie(SESSION_COOKIE, baseAttributes(settings));
}

export function readSessionToken(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE];
}
