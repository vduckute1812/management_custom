import { deleteUserRecord, getUserById } from "~/server/db/auth/users";
import {
  listStorageKeysForUser,
  purgeR2StorageKeys,
} from "~/server/db/feed/uploads";
import { listStoryStorageKeysForUser } from "~/server/db/feed/stories";
import { recountCommentCounts } from "~/server/db/feed/postComments";
import {
  invalidateAllAuthFeedCaches,
  invalidatePublicFeedCaches,
} from "~/server/utils/cacheInvalidate";

/**
 * Hard-delete an account and clean up resources that foreign-key cascades
 * cannot reach: address-only jobs, object storage, aggregate counts, and cache.
 */
export async function deleteUserAccount(id: string): Promise<boolean> {
  const user = await getUserById(id);
  if (!user) return false;

  const [uploadKeys, storyKeys] = await Promise.all([
    listStorageKeysForUser(id),
    listStoryStorageKeysForUser(id),
  ]);
  const storageKeys = [...new Set([...uploadKeys, ...storyKeys])];

  const { removed, touchedPostIds } = await deleteUserRecord(id, user.email);
  if (!removed) return false;

  if (touchedPostIds.length) {
    await recountCommentCounts(touchedPostIds);
  }
  if (storageKeys.length) {
    await purgeR2StorageKeys(storageKeys);
  }
  await invalidatePublicFeedCaches();
  await invalidateAllAuthFeedCaches();
  return true;
}
