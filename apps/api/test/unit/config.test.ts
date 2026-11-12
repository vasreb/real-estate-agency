import { loadConfig } from "../../src/infrastructure/config.js";
import { createLogger } from "../../src/infrastructure/logging.js";

const valid = {
  DATABASE_URL: "postgresql://test:test@localhost:5433/agency_test",
  PUBLIC_ORIGIN: "http://localhost:3000",
};
describe("runtime configuration", () => {
  it("sets the fixed eight-hour default without sliding expiry", () => {
    expect(loadConfig(valid)).toMatchObject({
      API_PORT: 3001,
      SESSION_TTL_SECONDS: 28800,
      API_HOST: "127.0.0.1",
    });
  });
  it.each([
    {},
    { ...valid, DATABASE_URL: "https://example.test/db" },
    { ...valid, DATABASE_URL: "postgresql://localhost" },
    { ...valid, PUBLIC_ORIGIN: "null" },
    { ...valid, PUBLIC_ORIGIN: "http://localhost:3000/" },
    { ...valid, PUBLIC_ORIGIN: "http://localhost:3000/path" },
    { ...valid, API_PORT: "0" },
  ])("rejects missing/invalid environment before listening (%#)", (env) => {
    expect(() => loadConfig(env)).toThrow("Invalid environment");
  });
  it("does not expose environment values in errors", () => {
    expect(() =>
      loadConfig({ ...valid, DATABASE_URL: "sensitive-sentinel" }),
    ).not.toThrow("sensitive-sentinel");
  });
  it("removes secrets and raw request and response details", () => {
    let output = "";
    const logger = createLogger("info", {
      write: (chunk: string) => {
        output += chunk;
      },
    });
    logger.info(
      {
        password: "secret-sentinel",
        token: "secret-sentinel",
        file_data: "secret-sentinel",
        body: "secret-sentinel",
        req: {
          method: "POST",
          headers: { cookie: "secret-sentinel" },
          body: { password: "secret-sentinel" },
        },
        res: { statusCode: 204, headers: { "set-cookie": "secret-sentinel" } },
        err: new Error("secret-sentinel"),
      },
      "test",
    );
    expect(output).not.toContain("secret-sentinel");
    expect(output).toContain("POST");
  });
});
