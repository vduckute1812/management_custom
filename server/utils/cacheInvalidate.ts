import {
  CacheKeys,
  cacheDel,
  cacheDelPrefix,
} from "~/server/utils/cache";

/** Bust category catalog caches after admin mutations. */
export async function invalidateCategoryCaches(): Promise<void> {
  await cacheDel(CacheKeys.categories());
  await cacheDelPrefix(CacheKeys.categoriesPrefix());
  // Category edits change feed filter chips / counts; clear public slices.
  await cacheDelPrefix(CacheKeys.feedPublicPrefix());
}

/** Drop anonymous public-feed cache slices after post mutations. */
export async function invalidatePublicFeedCaches(): Promise<void> {
  await cacheDelPrefix(CacheKeys.feedPublicPrefix());
}
