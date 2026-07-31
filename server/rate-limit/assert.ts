import type { H3Event } from "h3";
import { checkRateLimit } from "./check";
import { rateLimitAccountKey, resolveAccountPolicy } from "./policies";
import type { RateLimitResult } from "./types";

export function applyRateLimitHeaders(
  event: H3Event,
  result: RateLimitResult,
): void {
  setResponseHeader(event, "X-RateLimit-Limit", String(result.limit));
  setResponseHeader(event, "X-RateLimit-Remaining", String(result.remaining));
  setResponseHeader(
    event,
    "X-RateLimit-Reset",
    String(Math.ceil(result.resetAt / 1000)),
  );
}

export function throwTooMany(event: H3Event, result: RateLimitResult): never {
  applyRateLimitHeaders(event, result);
  const retryAfter = Math.max(
    1,
    Math.ceil((result.resetAt - Date.now()) / 1000),
  );
  setResponseHeader(event, "Retry-After", retryAfter);
  throw createError({
    statusCode: 429,
    statusMessage: "Too many requests. Please try again later.",
  });
}

/**
 * Per-account budget for credential endpoints. No-ops when the path has no
 * account policy. `account` must already be normalised (lowercased email).
 *
 * Counts every attempt — including wrong passwords — so a stuffing run that
 * rotates source IPs still exhausts the email bucket.
 */
export async function assertAccountRateLimit(
  event: H3Event,
  account: string,
  path: string,
): Promise<void> {
  const policy = resolveAccountPolicy(path);
  if (!policy) return;
  const key = rateLimitAccountKey(account, path);
  const result = await checkRateLimit(key, policy);
  if (!result.allowed) throwTooMany(event, result);
}
