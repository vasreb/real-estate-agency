import { createRateLimiter } from "../../src/infrastructure/security/rate-limit.js";

describe("bounded fixed-window rate limiter", () => {
  it("allows the quota, rejects with Retry-After, and resets after the window", () => {
    let now = 0;
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      maxKeys: 10,
      now: () => now,
    });
    for (let i = 0; i < 3; i += 1) expect(limiter.hit("a").allowed).toBe(true);
    now = 15_000;
    expect(limiter.hit("a")).toEqual({ allowed: false, retryAfterSeconds: 45 });
    expect(limiter.hit("b").allowed).toBe(true);
    now = 60_000;
    expect(limiter.hit("a").allowed).toBe(true);
  });

  it("bounds the number of keys: new keys get 429 at capacity, existing keys keep their count", () => {
    let now = 0;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 1_000,
      maxKeys: 2,
      now: () => now,
    });
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("b").allowed).toBe(true);
    expect(limiter.size()).toBe(2);
    const rejected = limiter.hit("c");
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    expect(limiter.size()).toBe(2);
    // The saturated key was not reset by the attempt from a new key.
    expect(limiter.hit("a").allowed).toBe(false);
    now = 1_000;
    expect(limiter.hit("c").allowed).toBe(true);
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});
