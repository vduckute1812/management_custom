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
  { prefix: "/api/auth/account", limit: 5, windowMs: 60_000 },
  { prefix: "/api/auth/google/unlink", limit: 10, windowMs: 60_000 },
  { prefix: "/api/auth/google", limit: 20, windowMs: 60_000 },
  { prefix: "/api/auth/login", limit: 10, windowMs: 60_000 },
  { prefix: "/api/auth/signup", limit: 5, windowMs: 60_000 },
  { prefix: "/api/auth/refresh", limit: 30, windowMs: 60_000 },
  { prefix: "/api/auth/forgot-password", limit: 5, windowMs: 60_000 },
  { prefix: "/api/auth/reset-password", limit: 10, windowMs: 60_000 },
  { prefix: "/api/uploads", limit: 30, windowMs: 60_000 },
  // Article pipeline — LLM / outbound feed work is expensive.
  // Longer prefixes first so fetch gets its own tighter bucket.
  { prefix: "/api/admin/articles/pending/fetch", limit: 2, windowMs: 60_000 },
  {
    prefix: "/api/admin/articles/pending",
    limit: 20,
    windowMs: 60_000,
  },
];

/**
 * Per-account budgets layered on top of the per-IP ones for credential
 * endpoints. A distributed stuffing run that rotates XFF / source IPs still
 * hits the same email bucket.
 */
export const ACCOUNT_POLICIES: Array<{
  prefix: string;
  limit: number;
  windowMs: number;
}> = [
  { prefix: "/api/auth/login", limit: 10, windowMs: 60_000 },
  { prefix: "/api/auth/signup", limit: 5, windowMs: 60_000 },
  { prefix: "/api/auth/forgot-password", limit: 5, windowMs: 60_000 },
  { prefix: "/api/auth/account", limit: 5, windowMs: 60_000 },
];

export function resolvePolicy(path: string): RateLimitPolicy {
  const bare = path.split("?")[0] || path;
  const match = ROUTE_POLICIES.find((r) => bare.startsWith(r.prefix));
  if (match) {
    return { limit: match.limit, windowMs: match.windowMs };
  }
  return { limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS };
}

export function resolveAccountPolicy(path: string): RateLimitPolicy | null {
  const bare = path.split("?")[0] || path;
  const match = ACCOUNT_POLICIES.find((r) => bare.startsWith(r.prefix));
  return match ? { limit: match.limit, windowMs: match.windowMs } : null;
}

/**
 * Bucket scope for a path: strict routes share the matched policy prefix
 * (so /api/uploads/* and article regenerate routes each share one budget);
 * everything else shares "global".
 */
export function rateLimitScope(path: string): string {
  const bare = path.split("?")[0] || path;
  const match = ROUTE_POLICIES.find((r) => bare.startsWith(r.prefix));
  return match ? match.prefix : "global";
}

/** Full store key for an IP-scoped bucket: `ip:global` or `ip:/api/auth/login`. */
export function rateLimitKey(ip: string, path: string): string {
  return `${ip}:${rateLimitScope(path)}`;
}

/**
 * Full store key for an account-scoped bucket.
 * `account` is expected already lowercased (email).
 */
export function rateLimitAccountKey(account: string, path: string): string {
  const bare = path.split("?")[0] || path;
  return `account:${account}:${bare}`;
}
