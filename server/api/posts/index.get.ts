import { listFeedPosts } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";
import {
  CacheKeys,
  CacheTTL,
  cacheGetOrSet,
} from "~/server/utils/cache";

/**
 * Feed listing. Authenticated users see public + own + shared-with-me posts.
 * Anonymous visitors only receive posts with `visibility: public`.
 *
 * Public (anonymous) pages are cached briefly — ACL for signed-in users is
 * viewer-specific and is never cached.
 */
export default defineEventHandler(async (event) => {
  const user = getOptionalUser(event);
  const query = getQuery(event);
  const cursor =
    typeof query.cursor === "string" && query.cursor.trim()
      ? query.cursor.trim()
      : null;
  const categoryId =
    typeof query.categoryId === "string" && query.categoryId.trim()
      ? query.categoryId.trim()
      : null;
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

  if (!user) {
    return cacheGetOrSet(
      CacheKeys.feedPublic(cursor, categoryId),
      CacheTTL.feedPublic,
      () => listFeedPosts(null, { cursor, limit, categoryId }),
    );
  }

  return listFeedPosts(user.sub, { cursor, limit, categoryId });
});
