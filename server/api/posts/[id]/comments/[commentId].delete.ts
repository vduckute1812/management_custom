import { deletePostComment } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  const commentId = getRouterParam(event, "commentId");
  if (!id || !commentId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Post id and comment id required",
    });
  }

  const ok = await deletePostComment(user.sub, id, commentId);
  if (!ok) {
    throw createError({
      statusCode: 404,
      statusMessage: "Comment not found",
    });
  }
  return { ok: true };
});
