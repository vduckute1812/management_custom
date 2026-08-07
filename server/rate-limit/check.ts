import { RateLimitStoreUnavailableError, rateLimitHit } from "./store";
import type { RateLimitOptions, RateLimitResult } from "./types";

/**
 * Fixed-window rate limit check keyed by an arbitrary client identifier
 * (typically `ip:global`, `ip:/api/auth/login`, or `account:email:/api/auth/login`).
 *
 * Pass `failClosed: true` for credential endpoints when Redis is the source
 * of truth — a store outage must not reset auth budgets.
 */
export async function checkRateLimit(
  key: string,
  { limit, windowMs, failClosed }: RateLimitOptions,
): Promise<RateLimitResult> {
  let count: number;
  let resetAt: number;
  try {
    ({ count, resetAt } = await rateLimitHit(key, windowMs, { failClosed }));
  } catch (err) {
    if (err instanceof RateLimitStoreUnavailableError) {
      throw createError({
        statusCode: 503,
        statusMessage: "Rate limit temporarily unavailable",
      });
    }
    throw err;
  }

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
