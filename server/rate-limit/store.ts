/**
 * In-memory fixed-window rate-limit store.
 * Suitable for single-instance deployments (one Nitro process).
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();

/** Prune expired buckets periodically so the map doesn't grow forever. */
let lastPrune = Date.now();
const PRUNE_INTERVAL_MS = 60_000;

function pruneExpired(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Increment the counter for `key` within a fixed window of `windowMs`.
 * Returns the 1-based count after increment and when the window resets.
 */
export function rateLimitHit(
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

/** Clear all buckets — tests only. */
export function _resetRateLimitStoreForTests() {
  buckets.clear();
  lastPrune = Date.now();
}
