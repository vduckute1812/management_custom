import type { RateLimitPolicy } from "./types";

/** Default: 120 requests per minute per IP (shared across non-strict routes). */
export const DEFAULT_LIMIT = 120;
export const DEFAULT_WINDOW_MS = 60_000;

/**
 * Stricter caps for sensitive / expensive endpoints.
 * First matching prefix wins (longest prefixes should be listed first if nested).
 */
export const ROUTE_POLICIES: Array<{
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

export function resolvePolicy(path: string): RateLimitPolicy {
  const bare = path.split("?")[0] || path;
  const match = ROUTE_POLICIES.find((r) => bare.startsWith(r.prefix));
  if (match) {
    return { limit: match.limit, windowMs: match.windowMs };
  }
  return { limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS };
}

/**
 * Bucket scope for a path: strict routes use the path itself so auth/upload
 * budgets stay isolated; everything else shares `global`.
 */
export function rateLimitScope(path: string): string {
  const bare = path.split("?")[0] || path;
  const isStrict = ROUTE_POLICIES.some((r) => bare.startsWith(r.prefix));
  return isStrict ? bare : "global";
}

/** Full store key: `ip:global` or `ip:/api/auth/login` (etc.). */
export function rateLimitKey(ip: string, path: string): string {
  return `${ip}:${rateLimitScope(path)}`;
}
