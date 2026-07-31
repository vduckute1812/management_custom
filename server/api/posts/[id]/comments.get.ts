import { listPostComments } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";
import { postCommentsQuerySchema } from "~/server/schemas";
import { parseQuery } from "~/server/utils/http";

/**
 * List comments on a post the viewer may see (public posts work anonymously).
 * Newest page first; pass `before` (ISO createdAt) to load older comments.
 */
export default defineEventHandler(async (event) => {
  const user = getOptionalUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const query = parseQuery(event, postCommentsQuerySchema);

  try {
    const page = await listPostComments(user?.sub ?? null, id, {
      limit: query.limit,
      before: query.before,
    });
    return page;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "Post not found" });
    }
    throw err;
  }
});
