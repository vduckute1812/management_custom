import { listPostComments } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";
import { postCommentsQuerySchema } from "~/server/schemas";
import { DomainError, mapDomainError, parseQuery } from "~/server/utils/http";

/**
 * List comments on a post the viewer may see (public posts work anonymously).
 * Newest page first; pass `before` (ISO createdAt) to load older comments.
 */
export default defineEventHandler(async (event) => {
  try {
    const user = getOptionalUser(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Post id required");
    }

    const query = parseQuery(event, postCommentsQuerySchema);
    const page = await listPostComments(user?.sub ?? null, id, {
      limit: query.limit,
      before: query.before,
    });
    return page;
  } catch (err) {
    mapDomainError(err);
  }
});
