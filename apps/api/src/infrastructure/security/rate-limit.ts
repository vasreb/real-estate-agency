export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };
export type RateLimiter = {
  hit(key: string): RateLimitResult;
  size(): number;
};

/**
 * Fixed-window counter with a hard bound on tracked keys. Expired windows are
 * pruned; at capacity a new key is rejected instead of evicting an existing
 * one, so attackers cannot reset a saturated key by flooding new keys.
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys: number;
  now?: () => number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();
  const retryAfter = (resetAt: number, at: number) =>
    Math.max(1, Math.ceil((resetAt - at) / 1000));
  function prune(at: number) {
    // Map iteration is insertion order, which is also window-start order.
    for (const [key, window] of windows) {
      if (window.resetAt > at) break;
      windows.delete(key);
    }
  }
  return {
    hit(key) {
      const at = now();
      prune(at);
      const existing = windows.get(key);
      if (existing) {
        if (existing.count >= options.limit)
          return {
            allowed: false,
            retryAfterSeconds: retryAfter(existing.resetAt, at),
          };
        existing.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (windows.size >= options.maxKeys) {
        const oldest = windows.values().next().value!;
        return {
          allowed: false,
          retryAfterSeconds: retryAfter(oldest.resetAt, at),
        };
      }
      windows.set(key, { count: 1, resetAt: at + options.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size: () => windows.size,
  };
}
