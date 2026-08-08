import { CacheKeys, cacheDel, cacheDelPrefix } from "~/server/utils/cache";

/** Bust category catalog caches after admin mutations. */
export async function invalidateCategoryCaches(): Promise<void> {
  await cacheDel(CacheKeys.categories());
  await cacheDelPrefix(CacheKeys.categoriesPrefix());
  // Category edits change feed filter chips / counts; clear public + auth slices.
  await cacheDelPrefix(CacheKeys.feedPublicPrefix());
  await cacheDelPrefix(CacheKeys.feedAuthAllPrefix());
}

/** Drop anonymous public-feed cache slices after post mutations. */
export async function invalidatePublicFeedCaches(): Promise<void> {
  await cacheDelPrefix(CacheKeys.feedPublicPrefix());
}

/** Drop all viewer-scoped auth feed slices (public post writes, category edits). */
export async function invalidateAllAuthFeedCaches(): Promise<void> {
  await cacheDelPrefix(CacheKeys.feedAuthAllPrefix());
}

/** Drop one viewer's auth feed pages (private writes, friendship graph). */
export async function invalidateAuthFeedCachesForViewer(
  userId: string,
): Promise<void> {
  if (!userId) return;
  await cacheDelPrefix(CacheKeys.feedAuthPrefix(userId));
}

/**
 * After a post create/update/delete/share:
 * - Public (or was public): bust anonymous + all auth feeds.
 * - Otherwise: bust actor (+ shared audience) auth feeds only.
 */
export async function invalidateFeedCachesAfterPostMutation(input: {
  actorId: string;
  touchesPublic: boolean;
  audienceUserIds?: string[];
}): Promise<void> {
  if (input.touchesPublic) {
    await invalidatePublicFeedCaches();
    await invalidateAllAuthFeedCaches();
    return;
  }
  await invalidateAuthFeedCachesForViewer(input.actorId);
  for (const id of input.audienceUserIds ?? []) {
    if (id && id !== input.actorId) {
      await invalidateAuthFeedCachesForViewer(id);
    }
  }
}
