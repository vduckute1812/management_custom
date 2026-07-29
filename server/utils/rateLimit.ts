/**
 * Re-export the rate-limit module for existing `~/server/utils/rateLimit` imports.
 * Prefer `~/server/rate-limit` for new code.
 */
export {
  checkRateLimit,
  clientIp,
  rateLimitKey,
  resolvePolicy,
} from "~/server/rate-limit";
export type { RateLimitOptions, RateLimitResult } from "~/server/rate-limit";
