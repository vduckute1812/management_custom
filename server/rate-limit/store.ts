/**
 * Fixed-window rate-limit store.
 *
 * Memory is the default (single Nitro process, zero deps). When `REDIS_URL` is
 * set the same counters live in Redis so a restart — or a future second
 * instance — cannot reset the auth budgets. Redis failures fall open to
 * memory: a cache outage must not take authentication with it.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();

let lastPrune = Date.now();
const PRUNE_INTERVAL_MS = 60_000;

function pruneExpired(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

function memoryHit(
  key: string,
  windowMs: number,
): { count: number; resetAt: number } {
  const now = Date.now();
  pruneExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { count: 1, resetAt };
  }

  existing.count += 1;
  return { count: existing.count, resetAt: existing.resetAt };
}

// -------------------------------------------------------------------------
// Optional Redis driver (lazy, fail-open)
// -------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = any;

let redisPromise: Promise<RedisClient | null> | null = null;

function redisKeyPrefix(): string {
  const ns = (
    process.env.CACHE_NAMESPACE ||
    process.env.DB_NAME ||
    "rc"
  ).trim();
  return `mgmt:${ns}:rl:`;
}

async function getRedis(): Promise<RedisClient | null> {
  if (redisPromise) return redisPromise;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redisPromise = Promise.resolve(null);
    return redisPromise;
  }
  redisPromise = (async () => {
    try {
      const { default: Redis } = await import("ioredis");
      const client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      await client.ping();
      return client;
    } catch (err) {
      console.warn(
        "[rate-limit] redis unavailable, using memory:",
        (err as Error)?.message || err,
      );
      return null;
    }
  })();
  return redisPromise;
}

/**
 * Aligned fixed window in Redis via INCR + EXPIRE.
 * Window boundaries differ slightly from the memory driver's
 * "window starts on first hit" rule; both enforce the same budget.
 */
async function redisHit(
  client: RedisClient,
  key: string,
  windowMs: number,
): Promise<{ count: number; resetAt: number }> {
  const now = Date.now();
  const windowId = Math.floor(now / windowMs);
  const resetAt = (windowId + 1) * windowMs;
  const redisKey = `${redisKeyPrefix()}${key}:${windowId}`;
  const count = await client.incr(redisKey);
  if (count === 1) {
    // +1s cushion so the key outlives the window even with clock skew.
    await client.expire(redisKey, Math.ceil(windowMs / 1000) + 1);
  }
  return { count: Number(count), resetAt };
}

/**
 * Increment the counter for `key` within a fixed window of `windowMs`.
 * Returns the 1-based count after increment and when the window resets.
 */
export async function rateLimitHit(
  key: string,
  windowMs: number,
): Promise<{ count: number; resetAt: number }> {
  const client = await getRedis();
  if (client) {
    try {
      return await redisHit(client, key, windowMs);
    } catch (err) {
      console.warn(
        "[rate-limit] redis hit failed, falling back to memory:",
        (err as Error)?.message || err,
      );
    }
  }
  return memoryHit(key, windowMs);
}

/** Clear all memory buckets — tests only. Does not touch Redis. */
export function _resetRateLimitStoreForTests() {
  buckets.clear();
  lastPrune = Date.now();
  redisPromise = Promise.resolve(null);
}
