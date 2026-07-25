import { listPostComments } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";

/**
 * List comments on a post the viewer may see (public posts work anonymously).
 */
export default defineEventHandler(async (event) => {
  const user = getOptionalUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  try {
    const comments = await listPostComments(user?.sub ?? null, id);
    return { comments };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "Post not found" });
    }
    throw err;
  }
});
