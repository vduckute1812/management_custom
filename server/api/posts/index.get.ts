import { listFeedPosts } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";

/**
 * Feed listing. Authenticated users see public + own + shared-with-me posts.
 * Anonymous visitors only receive posts with `visibility: public`.
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

  return listFeedPosts(user?.sub ?? null, { cursor, limit, categoryId });
});
