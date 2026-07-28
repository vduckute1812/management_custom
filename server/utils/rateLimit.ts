/**
 * In-memory sliding-window rate limiter keyed by client identifier.
 * Suitable for single-instance deployments; swap the store for Redis when
 * running multiple Nitro workers behind a load balancer.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();

/** Prune expired buckets periodically so the map doesn't grow forever. */
let lastPrune = Date.now();
const PRUNE_INTERVAL_MS = 60_000;

function pruneExpired(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/** Extract the client IP from proxy headers or the socket. */
export function clientIp(event: {
  node: {
    req: {
      headers: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    };
  };
}): string {
  const headers = event.node.req.headers;
  const forwarded = headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]?.split(",")[0]?.trim()
    : forwarded?.split(",")[0]?.trim();
  const realIp = headers["x-real-ip"];
  return (
    ip ||
    (Array.isArray(realIp) ? realIp[0] : realIp) ||
    event.node.req.socket?.remoteAddress ||
    "unknown"
  );
}
