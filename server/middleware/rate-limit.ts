/**
 * Global API rate limiting. Returns 429 when a client exceeds the
 * configured request budget within the window.
 *
 * Keys are per client IP: strict auth/upload paths get their own bucket;
 * all other `/api/*` routes share `ip:global`. See `server/rate-limit/`.
 */
import {
  checkRateLimit,
  clientIp,
  rateLimitKey,
  resolvePolicy,
} from "~/server/rate-limit";

export default defineEventHandler((event) => {
  const path = event.path;
  if (!path.startsWith("/api/")) return;

  const policy = resolvePolicy(path);
  const ip = clientIp(event);
  const key = rateLimitKey(ip, path);
  const result = checkRateLimit(key, policy);

  setResponseHeader(event, "X-RateLimit-Limit", String(result.limit));
  setResponseHeader(event, "X-RateLimit-Remaining", String(result.remaining));
  setResponseHeader(
    event,
    "X-RateLimit-Reset",
    String(Math.ceil(result.resetAt / 1000)),
  );

  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((result.resetAt - Date.now()) / 1000),
    );
    // h3 TypedHeaders types Retry-After as number (seconds).
    setResponseHeader(event, "Retry-After", retryAfter);
    throw createError({
      statusCode: 429,
      statusMessage: "Too many requests. Please try again later.",
    });
  }
});
