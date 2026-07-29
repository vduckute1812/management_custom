/**
 * API rate-limit module (in-memory, single-instance).
 *
 * - Per-IP keys (`ip:global` or `ip:<strict-path>` for auth/uploads)
 * - Route-specific policies for auth / uploads
 */

export { checkRateLimit } from "./check";
export { clientIp } from "./clientIp";
export {
  DEFAULT_LIMIT,
  DEFAULT_WINDOW_MS,
  ROUTE_POLICIES,
  rateLimitKey,
  rateLimitScope,
  resolvePolicy,
} from "./policies";
export { _resetRateLimitStoreForTests, rateLimitHit } from "./store";
export type {
  RateLimitOptions,
  RateLimitPolicy,
  RateLimitResult,
} from "./types";
