import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/infrastructure/config.js";

const base = {
  DATABASE_URL: "postgresql://test:test@localhost:5433/agency_test",
  PUBLIC_ORIGIN: "http://localhost:3000",
  LOG_LEVEL: "silent",
};

describe("TRUSTED_PROXIES configuration", () => {
  it("defaults to no trusted proxies", () => {
    expect(loadConfig(base).TRUSTED_PROXIES).toEqual([]);
  });

  it("accepts explicit IPs and bounded CIDRs", () => {
    expect(
      loadConfig({
        ...base,
        TRUSTED_PROXIES: " 127.0.0.1, 172.30.0.0/24 ,::1, fd00::/64",
      }).TRUSTED_PROXIES,
    ).toEqual(["127.0.0.1", "172.30.0.0/24", "::1", "fd00::/64"]);
  });

  it.each([
    "true",
    "*",
    "0.0.0.0/0",
    "::/0",
    "10.0.0.0/7",
    "loopback",
    "127.0.0.1/33",
    "127.0.0.1/8/1",
    "not-an-ip",
  ])("refuses unconditional or invalid trust %s", (value) => {
    expect(() => loadConfig({ ...base, TRUSTED_PROXIES: value })).toThrow(
      "Invalid environment: TRUSTED_PROXIES",
    );
  });
});

describe("client address resolution", () => {
  async function resolveIp(
    trusted: string,
    remoteAddress: string,
    forwardedFor?: string,
  ) {
    const app = createApp(loadConfig({ ...base, TRUSTED_PROXIES: trusted }));
    app.get("/ip", (request) => ({ ip: request.ip }));
    try {
      const response = await app.inject({
        url: "/ip",
        remoteAddress,
        headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
      });
      return response.json<{ ip: string }>().ip;
    } finally {
      await app.close();
    }
  }

  it("ignores X-Forwarded-For when no proxy is trusted", async () => {
    await expect(resolveIp("", "172.30.0.10", "198.51.100.7")).resolves.toBe(
      "172.30.0.10",
    );
  });

  it("ignores X-Forwarded-For from an untrusted peer", async () => {
    await expect(
      resolveIp("172.30.0.10", "192.0.2.50", "198.51.100.7"),
    ).resolves.toBe("192.0.2.50");
  });

  it("uses the hop appended by the trusted proxy, not a forged leftmost entry", async () => {
    await expect(
      resolveIp("172.30.0.10", "172.30.0.10", "203.0.113.66, 198.51.100.7"),
    ).resolves.toBe("198.51.100.7");
  });

  it("walks through every trusted hop (edge + web) to the real client", async () => {
    await expect(
      resolveIp(
        "172.30.0.10,172.30.0.1",
        "172.30.0.10",
        "203.0.113.66, 198.51.100.7, 172.30.0.1",
      ),
    ).resolves.toBe("198.51.100.7");
  });
});
