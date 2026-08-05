import { deletePostComment } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  try {
    const user = requireUser(event);
    const id = getRouterParam(event, "id");
    const commentId = getRouterParam(event, "commentId");
    if (!id || !commentId) {
      throw new DomainError(400, "Post id and comment id required");
    }

    const ok = await deletePostComment(user.sub, id, commentId);
    if (!ok) {
      throw new DomainError(404, "Comment not found");
    }
    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
