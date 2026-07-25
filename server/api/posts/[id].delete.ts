import { deletePost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const ok = await deletePost(user.sub, id);
  if (!ok) {
    throw createError({
      statusCode: 404,
      statusMessage: "Post not found",
    });
  }
  return { ok: true };
});
