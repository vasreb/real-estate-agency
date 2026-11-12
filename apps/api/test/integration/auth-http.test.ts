import { createHash } from "node:crypto";
import {
  accounts,
  createTestApp,
  login,
  openDatabase,
  ORIGIN,
} from "./helpers.js";

const db = openDatabase();
afterAll(async () => {
  await db.$disconnect();
});

function post(
  app: ReturnType<typeof createTestApp>,
  url: string,
  options: {
    payload?: Record<string, unknown>;
    cookie?: string;
    origin?: string | null;
    headers?: Record<string, string>;
    remoteAddress?: string;
  } = {},
) {
  return app.inject({
    method: "POST",
    url,
    ...(options.remoteAddress ? { remoteAddress: options.remoteAddress } : {}),
    headers: {
      ...(options.origin === null ? {} : { origin: options.origin ?? ORIGIN }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  });
}

describe("POST /api/auth/login", () => {
  it("returns 204 with a host-only HttpOnly Lax cookie and no-store", async () => {
    const app = createTestApp(db);
    try {
      const response = await post(app, "/api/auth/login", {
        payload: {
          email: "  MEMBER@agency.test ",
          password: accounts.member.password,
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
      expect(response.headers["cache-control"]).toBe("private, no-store");
      const header = String(response.headers["set-cookie"]);
      expect(header).toMatch(/^agency_session=[A-Za-z0-9_-]{43};/);
      expect(header).toContain("Path=/");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=Lax");
      expect(header).toContain("Max-Age=28800");
      expect(header).not.toContain("Domain=");
      expect(header).not.toContain("Secure");
    } finally {
      await app.close();
    }
  });

  it("adds Secure when PUBLIC_ORIGIN is HTTPS", async () => {
    const app = createTestApp(db, {
      config: { PUBLIC_ORIGIN: "https://agency.example" },
    });
    try {
      const response = await post(app, "/api/auth/login", {
        origin: "https://agency.example",
        payload: accounts.member,
      });
      expect(response.statusCode).toBe(204);
      expect(String(response.headers["set-cookie"])).toContain("Secure");
    } finally {
      await app.close();
    }
  });

  it("returns the same generic 401 for wrong password and unknown email", async () => {
    const app = createTestApp(db);
    try {
      const wrong = await post(app, "/api/auth/login", {
        payload: { email: accounts.member.email, password: "wrong-password-1" },
      });
      const unknown = await post(app, "/api/auth/login", {
        payload: { email: "ghost@agency.test", password: "wrong-password-1" },
      });
      for (const response of [wrong, unknown]) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          code: "UNAUTHENTICATED",
          message: wrong.json<{ message: string }>().message,
        });
        expect(response.headers["set-cookie"]).toBeUndefined();
      }
    } finally {
      await app.close();
    }
  });

  it.each([
    {},
    { email: "x@agency.test" },
    { email: "not-an-email", password: "x" },
    { email: "x@agency.test", password: "x", extra: true },
  ])("rejects invalid body %# with 400", async (payload) => {
    const app = createTestApp(db);
    try {
      const response = await post(app, "/api/auth/login", { payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    } finally {
      await app.close();
    }
  });

  it.each([null, "null", "https://evil.test", "http://localhost:3000/"])(
    "rejects Origin %s with 403 before checking credentials",
    async (origin) => {
      const app = createTestApp(db);
      try {
        const response = await post(app, "/api/auth/login", {
          origin,
          payload: accounts.member,
          headers: { "x-forwarded-host": "localhost:3000" },
        });
        expect(response.statusCode).toBe(403);
        expect(response.headers["set-cookie"]).toBeUndefined();
      } finally {
        await app.close();
      }
    },
  );

  it("limits attempts per IP+email to 10 per window with Retry-After, ignoring X-Forwarded-For", async () => {
    const app = createTestApp(db);
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await post(app, "/api/auth/login", {
          remoteAddress: "10.0.0.1",
          headers: { "x-forwarded-for": `192.0.2.${attempt}` },
          payload: {
            email: accounts.member.email,
            password: "wrong-password-1",
          },
        });
        expect(response.statusCode).toBe(401);
      }
      const limited = await post(app, "/api/auth/login", {
        remoteAddress: "10.0.0.1",
        headers: { "x-forwarded-for": "198.51.100.1" },
        payload: {
          email: " Member@agency.test",
          password: accounts.member.password,
        },
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ code: "RATE_LIMITED" });
      expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
      const otherIp = await post(app, "/api/auth/login", {
        remoteAddress: "10.0.0.2",
        payload: accounts.member,
      });
      expect(otherIp.statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });

  it("applies an aggregate limit of 100 attempts per IP across emails", async () => {
    const app = createTestApp(db);
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await post(app, "/api/auth/login", {
          remoteAddress: "10.0.0.3",
          payload: { email: `user${attempt}@agency.test` },
        });
        expect(response.statusCode).toBe(400);
      }
      const limited = await post(app, "/api/auth/login", {
        remoteAddress: "10.0.0.3",
        payload: accounts.member,
      });
      expect(limited.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});

describe("rate limiting behind the trusted web proxy", () => {
  const WEB = "172.30.0.10";
  const viaWeb = (
    app: ReturnType<typeof createTestApp>,
    forwardedFor: string,
    payload: Record<string, unknown>,
  ) =>
    post(app, "/api/auth/login", {
      remoteAddress: WEB,
      headers: { "x-forwarded-for": forwardedFor },
      payload,
    });

  it("gives each real client its own aggregate bucket, so one client cannot lock out others", async () => {
    const app = createTestApp(db, { config: { TRUSTED_PROXIES: WEB } });
    try {
      for (let attempt = 0; attempt < 100; attempt += 1)
        expect(
          (
            await viaWeb(app, "198.51.100.7", {
              email: `x${attempt}@agency.test`,
            })
          ).statusCode,
        ).toBe(400);
      expect(
        (await viaWeb(app, "198.51.100.7", accounts.member)).statusCode,
      ).toBe(429);
      // Another user behind the same Next server still logs in.
      expect(
        (await viaWeb(app, "198.51.100.8", accounts.member)).statusCode,
      ).toBe(204);
    } finally {
      await app.close();
    }
  });

  it("cannot be bypassed by forging leftmost X-Forwarded-For entries", async () => {
    const app = createTestApp(db, { config: { TRUSTED_PROXIES: WEB } });
    try {
      for (let attempt = 0; attempt < 10; attempt += 1)
        expect(
          (
            await viaWeb(app, `203.0.113.${attempt}, 198.51.100.9`, {
              email: accounts.member.email,
              password: "wrong-password-1",
            })
          ).statusCode,
        ).toBe(401);
      expect(
        (await viaWeb(app, "203.0.113.200, 198.51.100.9", accounts.member))
          .statusCode,
      ).toBe(429);
    } finally {
      await app.close();
    }
  });

  it("ignores X-Forwarded-For from a peer that is not the trusted proxy", async () => {
    const app = createTestApp(db, { config: { TRUSTED_PROXIES: WEB } });
    try {
      for (let attempt = 0; attempt < 10; attempt += 1)
        await post(app, "/api/auth/login", {
          remoteAddress: "192.0.2.50",
          headers: { "x-forwarded-for": `198.51.100.${attempt}` },
          payload: {
            email: accounts.member.email,
            password: "wrong-password-1",
          },
        });
      const limited = await post(app, "/api/auth/login", {
        remoteAddress: "192.0.2.50",
        headers: { "x-forwarded-for": "198.51.100.250" },
        payload: accounts.member,
      });
      expect(limited.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the session, clears the cookie with the same attributes, and is idempotent", async () => {
    const app = createTestApp(db);
    try {
      const cookie = await login(app, accounts.admin);
      const token = cookie.split("=")[1]!;
      const hash = createHash("sha256").update(token).digest("hex");
      expect(await db.session.count({ where: { tokenHash: hash } })).toBe(1);
      const response = await post(app, "/api/auth/logout", { cookie });
      expect(response.statusCode).toBe(204);
      const header = String(response.headers["set-cookie"]);
      expect(header).toMatch(/^agency_session=;/);
      expect(header).toContain("Path=/");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=Lax");
      expect(header).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
      expect(await db.session.count({ where: { tokenHash: hash } })).toBe(0);
      const again = await post(app, "/api/auth/logout", { cookie });
      expect(again.statusCode).toBe(204);
      const anonymous = await post(app, "/api/auth/logout");
      expect(anonymous.statusCode).toBe(204);
      const list = await app.inject({ url: "/api/deals", headers: { cookie } });
      expect(list.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("requires an exact Origin", async () => {
    const app = createTestApp(db);
    try {
      const cookie = await login(app, accounts.admin);
      const response = await post(app, "/api/auth/logout", {
        cookie,
        origin: "https://evil.test",
      });
      expect(response.statusCode).toBe(403);
      const list = await app.inject({ url: "/api/deals", headers: { cookie } });
      expect(list.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
