import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/infrastructure/config.js";
import { HttpError } from "../../src/infrastructure/errors.js";
import { z } from "zod";

const config = loadConfig({
  DATABASE_URL: "postgresql://test:test@localhost:5433/agency_test",
  PUBLIC_ORIGIN: "http://localhost:3000",
  LOG_LEVEL: "silent",
});
describe("Fastify application factory", () => {
  it("is side-effect-free, supports ready/close, and returns safe not-found errors", async () => {
    const app = createApp(config);
    try {
      await app.ready();
      expect(app.server.listening).toBe(false);
      const response = await app.inject("/does-not-exist?secret=sentinel");
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        code: "NOT_FOUND",
        message: "Запись не найдена",
      });
      expect(response.headers["cache-control"]).toBe("private, no-store");
    } finally {
      await app.close();
    }
  });
  it("maps known, validation, and unexpected exceptions without internal details", async () => {
    const app = createApp(config);
    app.get("/known", () => {
      throw new HttpError("FORBIDDEN");
    });
    app.get("/invalid", () => z.string().parse(0));
    app.get("/unexpected", () => {
      throw new Error("SQL password sentinel");
    });
    try {
      expect((await app.inject("/known")).statusCode).toBe(403);
      expect((await app.inject("/invalid")).statusCode).toBe(400);
      const response = await app.inject("/unexpected");
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        code: "INTERNAL_ERROR",
        message: "Внутренняя ошибка сервера",
      });
      expect(response.body).not.toContain("sentinel");
    } finally {
      await app.close();
    }
  });
  it("checks exact Origin before parsing unsafe requests, ignoring forwarding headers", async () => {
    const app = createApp(config);
    app.post("/unsafe", () => null);
    try {
      for (const origin of [
        undefined,
        "null",
        "https://foreign.test",
        "http://localhost:3000/",
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/unsafe",
          headers: {
            ...(origin ? { origin } : {}),
            "x-forwarded-host": "localhost:3000",
          },
        });
        expect(response.statusCode).toBe(403);
      }
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/unsafe",
            headers: { origin: config.PUBLIC_ORIGIN },
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
});
