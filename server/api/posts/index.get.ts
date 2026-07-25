import { listFeedPosts } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = getQuery(event);
  const cursor =
    typeof query.cursor === "string" && query.cursor.trim()
      ? query.cursor.trim()
      : null;
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

  return listFeedPosts(user.sub, { cursor, limit });
});
