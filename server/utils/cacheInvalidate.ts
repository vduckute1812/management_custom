import { listAcceptedFriendIds } from "~/server/db/friends/friendshipCache";
import {
  invalidateAllUploadAccessCaches,
  invalidateUploadAccessCacheForViewers,
} from "~/server/db/feed/uploadAccess";
import { CacheKeys, cacheDel, cacheDelPrefix } from "~/server/utils/cache";
import { PostVisibility } from "~/types/post";

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

export type PostMutationCacheInput = {
  actorId: string;
  /** Visibility after the mutation (create/update/share result). */
  visibility: PostVisibility;
  /**
   * Visibility before update. Omit on create/share (treated as equal to
   * `visibility` for touch detection).
   */
  previousVisibility?: PostVisibility;
  /** Shared audience after the mutation. */
  audienceUserIds?: string[];
  /** Shared audience before an update (who may have lost access). */
  previousAudienceUserIds?: string[];
};

/** Pure helper — which visibility axes this mutation touches. */
export function postMutationCacheTouches(input: {
  visibility: PostVisibility;
  previousVisibility?: PostVisibility;
}): { touchesPublic: boolean; touchesFriends: boolean } {
  const previous = input.previousVisibility ?? input.visibility;
  return {
    touchesPublic:
      previous === PostVisibility.Public ||
      input.visibility === PostVisibility.Public,
    touchesFriends:
      previous === PostVisibility.Friends ||
      input.visibility === PostVisibility.Friends,
  };
}

/** Pure helper — union of actor + previous/next shared audience (no friends). */
export function collectPostMutationAudienceViewers(input: {
  actorId: string;
  audienceUserIds?: string[];
  previousAudienceUserIds?: string[];
}): string[] {
  const out = new Set<string>();
  if (input.actorId) out.add(input.actorId);
  for (const id of input.previousAudienceUserIds ?? []) {
    if (id) out.add(id);
  }
  for (const id of input.audienceUserIds ?? []) {
    if (id) out.add(id);
  }
  return [...out];
}

/**
 * After a post create/update/delete/share:
 * - Public (or was public): bust anonymous + all auth feeds + all upload ACL.
 * - Friends (or was friends): bust actor + accepted friends (+ shared audience).
 * - Shared: bust actor + previous and next audience members.
 * - Private-only: bust actor.
 *
 * Also drops process-local upload ACL positive entries for the same viewers so
 * a revoke (unshare / friends→private / leave audience) cannot serve media for
 * the remaining ~10s TTL.
 */
export async function invalidateFeedCachesAfterPostMutation(
  input: PostMutationCacheInput,
): Promise<void> {
  const { touchesPublic, touchesFriends } = postMutationCacheTouches(input);

  if (touchesPublic) {
    await invalidatePublicFeedCaches();
    await invalidateAllAuthFeedCaches();
    invalidateAllUploadAccessCaches();
    return;
  }

  const viewers = new Set(
    collectPostMutationAudienceViewers({
      actorId: input.actorId,
      audienceUserIds: input.audienceUserIds,
      previousAudienceUserIds: input.previousAudienceUserIds,
    }),
  );

  if (touchesFriends && input.actorId) {
    const friendIds = await listAcceptedFriendIds(input.actorId);
    for (const id of friendIds) {
      if (id) viewers.add(id);
    }
  }

  const viewerList = [...viewers];
  for (const id of viewerList) {
    await invalidateAuthFeedCachesForViewer(id);
  }
  invalidateUploadAccessCacheForViewers(viewerList);
}
