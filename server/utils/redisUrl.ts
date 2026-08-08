/**
 * Build a Redis connection URL that survives special characters in the
 * password (`/`, `+`, `=`, `@`, …). Compose interpolation of
 * `redis://:${REDIS_PASSWORD}@host` breaks on those characters and yields
 * `Invalid URL` in ioredis — which then fails closed on auth rate limits.
 *
 * Prefer `REDIS_PASSWORD` (+ host/port) when set; otherwise accept a valid
 * explicit `REDIS_URL`.
 */
export function resolveRedisUrl(): string | undefined {
  const password = process.env.REDIS_PASSWORD?.trim();
  const host = (
    process.env.REDIS_HOST ||
    process.env.LAN_IP ||
    "127.0.0.1"
  ).trim();
  const port = (process.env.REDIS_PORT || "6379").trim();
  const db = (process.env.REDIS_DB || "0").trim();

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}/${db}`;
  }

  const explicit = process.env.REDIS_URL?.trim();
  if (!explicit) return undefined;
  try {
    // Validate — bare passwords with `/` produce unparseable URLs.
    new URL(explicit);
    return explicit;
  } catch {
    return undefined;
  }
}
