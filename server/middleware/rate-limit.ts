/**
 * Global API rate limiting. Returns 429 when a client exceeds the
 * configured request budget within the window.
 *
 * Keys are per client IP (see `clientIp` for the trust order): strict
 * auth/upload paths get their own bucket; all other `/api/*` routes share
 * `ip:global`. Credential endpoints additionally check a per-account bucket
 * inside the handler — IP alone cannot stop a distributed stuffing run.
 */
import {
  applyRateLimitHeaders,
  checkRateLimit,
  clientIp,
  rateLimitKey,
  resolvePolicy,
  throwTooMany,
} from "~/server/rate-limit";

export default defineEventHandler(async (event) => {
  const path = event.path;
  if (!path.startsWith("/api/")) return;

  const policy = resolvePolicy(path);
  const ip = clientIp(event);
  const key = rateLimitKey(ip, path);
  const result = await checkRateLimit(key, policy);

  applyRateLimitHeaders(event, result);

  if (!result.allowed) throwTooMany(event, result);
});
