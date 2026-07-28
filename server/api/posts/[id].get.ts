import { getAuthorsByIds, getPostById } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";

/**
 * GET /api/posts/:id — single post when visible to the viewer (or public).
 * When the viewer can edit, also returns hydrated `audience` author cards
 * for the shared-visibility editor.
 */
export default defineEventHandler(async (event) => {
  const user = getOptionalUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const post = await getPostById(user?.sub ?? null, id);
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: "Post not found" });
  }

  const audience =
    post.canEdit && post.audienceUserIds.length
      ? await getAuthorsByIds(post.audienceUserIds)
      : [];

  return { post, audience };
});
