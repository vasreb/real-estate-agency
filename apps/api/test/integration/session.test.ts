import { createHash } from "node:crypto";
import { createAuthService } from "../../src/modules/auth/index.js";
import { ids } from "../fixtures/index.js";
import { accounts, openDatabase } from "./helpers.js";

const db = openDatabase();
afterAll(async () => {
  await db.$disconnect();
});

const clock = { now: new Date("2026-11-12T10:00:00Z") };
const auth = createAuthService({
  database: db,
  sessionTtlSeconds: 8 * 60 * 60,
  now: () => clock.now,
});
beforeEach(() => {
  clock.now = new Date("2026-11-12T10:00:00Z");
});

describe("hashed sessions", () => {
  it("creates a 32-byte base64url token and stores only its SHA-256 hash", async () => {
    const session = await auth.login(
      " Admin@AGENCY.test ",
      accounts.admin.password,
    );
    expect(session).not.toBeNull();
    const token = session!.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(session!.expiresAt.toISOString()).toBe("2026-11-12T18:00:00.000Z");
    const hash = createHash("sha256").update(token).digest("hex");
    const stored = await db.session.findUnique({ where: { tokenHash: hash } });
    expect(stored?.userId).toBe(ids.userAdmin);
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
    await expect(auth.authenticate(token)).resolves.toEqual({
      userId: ids.userAdmin,
    });
  });

  it("returns null for a wrong password and an unknown email", async () => {
    await expect(
      auth.login(accounts.admin.email, "wrong-password-value"),
    ).resolves.toBeNull();
    await expect(
      auth.login("nobody@agency.test", accounts.admin.password),
    ).resolves.toBeNull();
  });

  it("rejects expired sessions without sliding the expiry", async () => {
    const { token } = (await auth.login(
      accounts.member.email,
      accounts.member.password,
    ))!;
    clock.now = new Date("2026-11-12T17:59:59Z");
    await expect(auth.authenticate(token)).resolves.not.toBeNull();
    const hash = createHash("sha256").update(token).digest("hex");
    expect(
      (await db.session.findUnique({ where: { tokenHash: hash } }))?.expiresAt,
    ).toEqual(new Date("2026-11-12T18:00:00Z"));
    clock.now = new Date("2026-11-12T18:00:00Z");
    await expect(auth.authenticate(token)).resolves.toBeNull();
  });

  it("rejects revoked, unknown, and malformed tokens", async () => {
    const { token } = (await auth.login(
      accounts.member.email,
      accounts.member.password,
    ))!;
    await auth.logout(token);
    await auth.logout(token);
    await expect(auth.authenticate(token)).resolves.toBeNull();
    await expect(
      auth.authenticate(Buffer.alloc(32, 7).toString("base64url")),
    ).resolves.toBeNull();
    await expect(auth.authenticate("not a token")).resolves.toBeNull();
    await expect(auth.authenticate("")).resolves.toBeNull();
  });
});

describe("live team access", () => {
  it("reads the current role per team and reflects downgrade and removal after login", async () => {
    const { token } = (await auth.login(
      accounts.multi.email,
      accounts.multi.password,
    ))!;
    const { userId } = (await auth.authenticate(token))!;
    await expect(auth.resolveTeamAccess(userId, ids.teamNorth)).resolves.toBe(
      "member",
    );
    await expect(auth.resolveTeamAccess(userId, ids.teamSouth)).resolves.toBe(
      "admin",
    );
    const key = { teamId_userId: { teamId: ids.teamSouth, userId } };
    try {
      await db.teamMember.update({ where: key, data: { role: "member" } });
      await expect(auth.resolveTeamAccess(userId, ids.teamSouth)).resolves.toBe(
        "member",
      );
      await db.teamMember.delete({ where: key });
      await expect(
        auth.resolveTeamAccess(userId, ids.teamSouth),
      ).resolves.toBeNull();
      await expect(auth.authenticate(token)).resolves.toEqual({ userId });
    } finally {
      await db.teamMember.upsert({
        where: key,
        create: { teamId: ids.teamSouth, userId, role: "admin" },
        update: { role: "admin" },
      });
    }
  });
});
