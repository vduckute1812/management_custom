/**
 * API rate-limit module.
 *
 * - Per-IP keys (`ip:global` or `ip:<strict-path>` for auth/uploads)
 * - Per-account keys on login / signup / forgot-password (`account:email:…`)
 * - Route-specific policies for auth / uploads
 * - Memory store by default; Redis when `REDIS_URL` is set (fail-open)
 */

export {
  applyRateLimitHeaders,
  assertAccountRateLimit,
  throwTooMany,
} from "./assert";
export { checkRateLimit } from "./check";
export { clientIp } from "./clientIp";
export {
  ACCOUNT_POLICIES,
  DEFAULT_LIMIT,
  DEFAULT_WINDOW_MS,
  ROUTE_POLICIES,
  rateLimitAccountKey,
  rateLimitKey,
  rateLimitScope,
  resolveAccountPolicy,
  resolvePolicy,
} from "./policies";
export {
  RateLimitStoreUnavailableError,
  _resetRateLimitStoreForTests,
  rateLimitHit,
} from "./store";
export type {
  RateLimitOptions,
  RateLimitPolicy,
  RateLimitResult,
} from "./types";
