import { listFeedPosts } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";
import { CacheKeys, CacheTTL, cacheGetOrSet } from "~/server/utils/cache";
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
  const query = getQuery(event);
  const cursor =
    typeof query.cursor === "string" && query.cursor.trim()
      ? query.cursor.trim()
      : null;
  const categoryId =
    typeof query.categoryId === "string" && query.categoryId.trim()
      ? query.categoryId.trim()
      : null;
  const locale =
    typeof query.locale === "string" && isContentLocale(query.locale)
      ? query.locale
      : null;
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

  if (!user) {
    return cacheGetOrSet(
      CacheKeys.feedPublic(cursor, categoryId, locale),
      CacheTTL.feedPublic,
      () => listFeedPosts(null, { cursor, limit, categoryId, locale }),
    );
  }

  return listFeedPosts(user.sub, { cursor, limit, categoryId, locale });
});
