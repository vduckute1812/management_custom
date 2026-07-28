/**
 * Global API rate limiting. Returns 429 when a client exceeds the
 * configured request budget within the sliding window.
 */
import { checkRateLimit, clientIp } from "~/server/utils/rateLimit";

/** Default: 120 requests per minute per IP+path prefix. */
const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_MS = 60_000;

/** Stricter caps for auth-sensitive endpoints. */
const STRICT_ROUTES: Array<{
  prefix: string;
  limit: number;
  windowMs: number;
}> = [
  { prefix: "/api/auth/login", limit: 10, windowMs: 60_000 },
  { prefix: "/api/auth/signup", limit: 5, windowMs: 60_000 },
  { prefix: "/api/auth/refresh", limit: 30, windowMs: 60_000 },
  { prefix: "/api/auth/forgot-password", limit: 5, windowMs: 60_000 },
  { prefix: "/api/auth/reset-password", limit: 10, windowMs: 60_000 },
  { prefix: "/api/uploads", limit: 30, windowMs: 60_000 },
];

function resolvePolicy(path: string) {
  const match = STRICT_ROUTES.find((r) => path.startsWith(r.prefix));
  if (match) {
    return { limit: match.limit, windowMs: match.windowMs };
  }
  return { limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS };
}

export default defineEventHandler((event) => {
  const path = event.path;
  if (!path.startsWith("/api/")) return;

  const policy = resolvePolicy(path);
  const ip = clientIp(event);
  const scope = STRICT_ROUTES.some((r) => path.startsWith(r.prefix))
    ? path
    : "global";
  const key = `${ip}:${scope}`;
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
    setResponseHeader(event, "Retry-After", String(retryAfter));
    throw createError({
      statusCode: 429,
      statusMessage: "Too many requests. Please try again later.",
    });
  }
});
