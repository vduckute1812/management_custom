import { rateLimitHit } from "./store";
import type { RateLimitOptions, RateLimitResult } from "./types";

/**
 * Fixed-window rate limit check keyed by an arbitrary client identifier
 * (typically `ip:global` or `ip:/api/auth/login`).
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const { count, resetAt } = rateLimitHit(key, windowMs);

  if (count > limit) {
    return { allowed: false, limit, remaining: 0, resetAt };
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}
