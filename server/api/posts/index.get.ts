import { listFeedPosts } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";
import { CacheKeys, CacheTTL, cacheGetOrSet } from "~/server/utils/cache";
import { parseQuery } from "~/server/utils/http";
import { feedQuerySchema } from "~/server/schemas";
import { isContentLocale } from "~/utils/contentLocale";

/**
 * Feed listing. Authenticated users see public + own + shared-with-me posts.
 * Anonymous visitors only receive posts with `visibility: public`.
 *
 * Public (anonymous) pages are cached briefly — ACL for signed-in users is
 * viewer-specific and is never cached.
 *
 * Optional `locale` prefers that content language for multilingual manuscripts.
 */
export default defineEventHandler(async (event) => {
  const user = getOptionalUser(event);
  const query = parseQuery(event, feedQuerySchema);
  const cursor = query.cursor?.trim() || null;
  const categoryId = query.categoryId?.trim() || null;
  const locale =
    query.locale && isContentLocale(query.locale) ? query.locale : null;
  const limit = query.limit;

  if (!user) {
    return cacheGetOrSet(
      CacheKeys.feedPublic(cursor, categoryId, locale),
      CacheTTL.feedPublic,
      () => listFeedPosts(null, { cursor, limit, categoryId, locale }),
    );
  }

  return listFeedPosts(user.sub, { cursor, limit, categoryId, locale });
});
