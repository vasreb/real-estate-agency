import type { Role } from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";
import { normalizeEmail } from "../domain/email.js";
import {
  createSessionToken,
  hashSessionToken,
  isWellFormedToken,
} from "../domain/session-token.js";
import { hashPassword, verifyPassword } from "../infrastructure/password.js";

export type AuthServiceOptions = {
  database: Database;
  sessionTtlSeconds: number;
  now?: () => Date;
};
export type AuthenticatedUser = { userId: string };
export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(options: AuthServiceOptions) {
  const { database } = options;
  const now = options.now ?? (() => new Date());
  // Verifying against a dummy hash keeps unknown-email timing close to a real check.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () =>
    (dummyHash ??= hashPassword("dummy-password-for-timing-equalization"));

  return {
    async login(
      email: string,
      password: string,
    ): Promise<{ token: string; expiresAt: Date } | null> {
      const user = await database.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { id: true, passwordHash: true },
      });
      const valid = await verifyPassword(
        user?.passwordHash ?? (await getDummyHash()),
        password,
      );
      if (!user || !valid) return null;
      const token = createSessionToken();
      const expiresAt = new Date(
        now().getTime() + options.sessionTtlSeconds * 1000,
      );
      await database.session.create({
        data: {
          tokenHash: hashSessionToken(token),
          userId: user.id,
          expiresAt,
        },
        select: { tokenHash: true },
      });
      return { token, expiresAt };
    },

    /** Expiry is enforced in SQL; there is no sliding extension. */
    async authenticate(token: string): Promise<AuthenticatedUser | null> {
      if (!isWellFormedToken(token)) return null;
      const session = await database.session.findFirst({
        where: { tokenHash: hashSessionToken(token), expiresAt: { gt: now() } },
        select: { userId: true },
      });
      return session ? { userId: session.userId } : null;
    },

    /** Idempotent: deleting an unknown or already revoked session is a no-op. */
    async logout(token: string): Promise<void> {
      if (!isWellFormedToken(token)) return;
      await database.session.deleteMany({
        where: { tokenHash: hashSessionToken(token) },
      });
    },

    /** Reads the current membership on every call; roles are never cached. */
    async resolveTeamAccess(
      userId: string,
      teamId: string,
    ): Promise<Role | null> {
      const membership = await database.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
        select: { role: true },
      });
      return membership?.role ?? null;
    },
  };
}
