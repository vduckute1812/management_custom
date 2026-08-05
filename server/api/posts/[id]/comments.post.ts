import { createPostComment } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { DomainError, mapDomainError, parseBody } from "~/server/utils/http";
import { postCommentCreateBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  try {
    const user = requireUser(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Post id required");
    }

    const body = await parseBody(event, postCommentCreateBodySchema);
    const comment = await createPostComment(user.sub, id, body.body);
    return { comment };
  } catch (err) {
    mapDomainError(err);
  }
});
