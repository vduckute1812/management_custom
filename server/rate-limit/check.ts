import { rateLimitHit } from "./store";
import type { RateLimitOptions, RateLimitResult } from "./types";

/**
 * Fixed-window rate limit check keyed by an arbitrary client identifier
 * (typically `ip:global`, `ip:/api/auth/login`, or `account:email:/api/auth/login`).
 */
export async function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const { count, resetAt } = await rateLimitHit(key, windowMs);

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
