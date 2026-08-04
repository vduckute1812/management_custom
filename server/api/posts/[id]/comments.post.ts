import { createPostComment } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseBody } from "~/server/utils/http";
import { postCommentCreateBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const body = await parseBody(event, postCommentCreateBodySchema);

  try {
    const comment = await createPostComment(user.sub, id, body.body);
    return { comment };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "Post not found" });
    }
    throw err;
  }
});
