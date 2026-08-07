import {
  listFeedPosts,
  listPostCategories,
  listStoriesTray,
} from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";
import { CacheKeys, CacheTTL, cacheGetOrSet } from "~/server/utils/cache";
import { parseQuery } from "~/server/utils/http";
import { feedQuerySchema } from "~/server/schemas";
import { isContentLocale } from "~/utils/contentLocale";
import type { FeedBootstrap } from "~/types/post";
import type { StoriesTray } from "~/types/story";

/**
 * Feed page bootstrap — categories + first posts page (+ stories when signed in)
 * in one round-trip so the client does not fan out three GETs on first paint.
 *
 * Subsequent pages still use `GET /api/posts?cursor=…`
 * (`createdAt|id`, with legacy ISO-only cursors still accepted).
 */
export default defineEventHandler(async (event): Promise<FeedBootstrap> => {
  const user = getOptionalUser(event);
  const query = parseQuery(event, feedQuerySchema);
  const cursor = query.cursor?.trim() || null;
  const categoryId = query.categoryId?.trim() || null;
  const locale =
    query.locale && isContentLocale(query.locale) ? query.locale : null;
  const limit = query.limit;

  const loadCategories = () =>
    cacheGetOrSet(CacheKeys.categories(), CacheTTL.categories, () =>
      listPostCategories(),
    );

  const loadPosts = () => {
    if (!user) {
      return cacheGetOrSet(
        CacheKeys.feedPublic(cursor, categoryId, locale, limit),
        CacheTTL.feedPublic,
        () => listFeedPosts(null, { cursor, limit, categoryId, locale }),
      );
    }
    return listFeedPosts(user.sub, { cursor, limit, categoryId, locale });
  };

  if (!user) {
    const [categories, page] = await Promise.all([
      loadCategories(),
      loadPosts(),
    ]);
    return {
      categories,
      posts: page.posts,
      nextCursor: page.nextCursor,
      stories: null,
    };
  }

  const [categories, page, stories] = await Promise.all([
    loadCategories(),
    loadPosts(),
    listStoriesTray(user.sub).catch((): StoriesTray => ({
      groups: [],
    })),
  ]);

  return {
    categories,
    posts: page.posts,
    nextCursor: page.nextCursor,
    stories,
  };
});
