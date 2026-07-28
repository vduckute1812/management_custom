/**
 * Cache facade for Nitro.
 *
 * Drivers:
 *   - memory (default) — process-local Map with TTL; zero deps, always on
 *   - redis            — shared cache when REDIS_URL is set (ioredis)
 *
 * Design goals for a single-node / Pi-friendly install:
 *   1. Never require Redis to boot.
 *   2. Fail open: Redis errors fall through to the loader (no hard outage).
 *   3. Namespaced keys so one install cannot collide with another.
 */

import { createHash } from "node:crypto";

export type CacheDriverName = "memory" | "redis";

export interface CacheGetOptions {
  /** Soft TTL hint for drivers that support it (seconds). */
  ttlSeconds?: number;
}

interface CacheDriver {
  name: CacheDriverName;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Best-effort prefix delete. Memory is exact; Redis uses SCAN. */
  delPrefix(prefix: string): Promise<void>;
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

class MemoryCacheDriver implements CacheDriver {
  readonly name: CacheDriverName = "memory";
  private readonly store = new Map<string, MemoryEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = Math.max(50, maxEntries);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh insertion order for a crude LRU when at capacity.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const ttlMs = Math.max(1, ttlSeconds) * 1000;
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

class RedisCacheDriver implements CacheDriver {
  readonly name: CacheDriverName = "redis";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private readonly prefix: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(client: any, prefix: string) {
    this.client = client;
    this.prefix = prefix;
  }

  private k(key: string) {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.client.get(this.k(key));
      if (raw == null) return undefined;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn("[cache:redis] get failed:", (err as Error)?.message || err);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      const ttl = Math.max(1, ttlSeconds);
      await this.client.set(this.k(key), JSON.stringify(value), "EX", ttl);
    } catch (err) {
      console.warn("[cache:redis] set failed:", (err as Error)?.message || err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(this.k(key));
    } catch (err) {
      console.warn("[cache:redis] del failed:", (err as Error)?.message || err);
    }
  }

  async delPrefix(prefix: string): Promise<void> {
    const match = `${this.prefix}${prefix}*`;
    try {
      let cursor = "0";
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          "MATCH",
          match,
          "COUNT",
          100,
        );
        cursor = String(next);
        if (keys?.length) await this.client.del(...keys);
      } while (cursor !== "0");
    } catch (err) {
      console.warn(
        "[cache:redis] delPrefix failed:",
        (err as Error)?.message || err,
      );
    }
  }
}

let driverPromise: Promise<CacheDriver> | null = null;

function namespacePrefix(): string {
  const ns = (process.env.CACHE_NAMESPACE || process.env.DB_NAME || "rc").trim();
  return `mgmt:${ns}:`;
}

async function createDriver(): Promise<CacheDriver> {
  const url = process.env.REDIS_URL?.trim();
  const prefer = (process.env.CACHE_DRIVER || "").trim().toLowerCase();
  const memoryMax = Number(process.env.CACHE_MEMORY_MAX || 500);

  if (prefer === "memory" || !url) {
    console.info("[cache] driver=memory");
    return new MemoryCacheDriver(memoryMax);
  }

  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 2000,
      retryStrategy: () => null,
    });
    await client.ping();
    console.info("[cache] driver=redis");
    return new RedisCacheDriver(client, namespacePrefix());
  } catch (err) {
    console.warn(
      "[cache] redis unavailable, falling back to memory:",
      (err as Error)?.message || err,
    );
    return new MemoryCacheDriver(memoryMax);
  }
}

async function getDriver(): Promise<CacheDriver> {
  if (!driverPromise) driverPromise = createDriver();
  return driverPromise;
}

export async function cacheDriverName(): Promise<CacheDriverName> {
  return (await getDriver()).name;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await getDriver()).get<T>(key);
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  await (await getDriver()).set(key, value, ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await (await getDriver()).del(key);
}

export async function cacheDelPrefix(prefix: string): Promise<void> {
  await (await getDriver()).delPrefix(prefix);
}

/**
 * Read-through helper. On miss, runs `loader`, stores the result, returns it.
 * Loader errors propagate; cache write failures are swallowed by the driver.
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await loader();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/** Stable hash for composing cache keys from structured query params. */
export function cacheKeyHash(parts: Record<string, unknown>): string {
  const json = JSON.stringify(parts, Object.keys(parts).sort());
  return createHash("sha1").update(json).digest("hex").slice(0, 12);
}

/** Canonical key builders — keep all call sites consistent. */
export const CacheKeys = {
  categories: () => "categories:list",
  categoriesPrefix: () => "categories:",
  feedPublic: (
    cursor: string | null,
    categoryId: string | null,
    locale: string | null = null,
  ) => `feed:public:${cacheKeyHash({ cursor, categoryId, locale })}`,
  feedPublicPrefix: () => "feed:public:",
} as const;

/** Default TTLs (seconds). Short enough that admin edits feel fresh. */
export const CacheTTL = {
  categories: 60,
  feedPublic: 20,
} as const;
