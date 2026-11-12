import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/infrastructure/config.js";

const SENTINEL = "secret-sentinel-7f3a";
const config = loadConfig({
  DATABASE_URL: "postgresql://test:test@localhost:5433/agency_test",
  PUBLIC_ORIGIN: "http://localhost:3000",
  LOG_LEVEL: "trace",
});

describe("request log redaction", () => {
  it("logs method/route/status but never cookies, tokens, bodies, query strings, or error text", async () => {
    let output = "";
    const app = createApp(config, {
      logDestination: {
        write: (chunk: string) => {
          output += chunk;
        },
      },
    });
    app.post("/echo", () => ({ ok: true }));
    app.get("/explode", () => {
      throw new Error(`database password ${SENTINEL}`);
    });
    app.post("/multipart", async (request) => {
      for await (const part of request.parts())
        if (part.type === "file") part.file.resume();
      return { ok: true };
    });
    try {
      await app.inject({
        method: "POST",
        url: `/echo?token=${SENTINEL}`,
        headers: {
          origin: config.PUBLIC_ORIGIN,
          cookie: `agency_session=${SENTINEL}`,
          authorization: `Bearer ${SENTINEL}`,
        },
        payload: { email: "a@agency.test", password: SENTINEL },
      });
      const failed = await app.inject({
        url: `/explode?q=${SENTINEL}`,
        headers: { cookie: `agency_session=${SENTINEL}` },
      });
      expect(failed.statusCode).toBe(500);
      expect(failed.body).not.toContain(SENTINEL);
      // Regression: @fastify/multipart logs busboy options with request
      // headers at trace level; cookies must still be redacted.
      const boundary = "----redaction";
      const multipart = await app.inject({
        method: "POST",
        url: "/multipart",
        headers: {
          origin: config.PUBLIC_ORIGIN,
          cookie: `agency_session=${SENTINEL}`,
          authorization: `Bearer ${SENTINEL}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nx\r\n--${boundary}--\r\n`,
      });
      expect(multipart.statusCode).toBe(200);
      expect(output).toContain("Providing options to busboy");
    } finally {
      await app.close();
    }
    expect(output).toContain("Request completed");
    expect(output).toContain('"route":"/echo"');
    expect(output).toContain('"statusCode":500');
    expect(output).not.toContain(SENTINEL);
  });
});
