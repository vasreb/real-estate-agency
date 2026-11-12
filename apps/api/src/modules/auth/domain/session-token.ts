import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 32 random bytes, base64url (43 chars). Only the SHA-256 hex is stored. */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
