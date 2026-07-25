import { createPostComment } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const body = await readBody<{ body?: string }>(event);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    throw createError({
      statusCode: 400,
      statusMessage: "Comment body is required",
    });
  }
  if (text.length > 2000) {
    throw createError({
      statusCode: 400,
      statusMessage: "Comment must be 2000 characters or fewer",
    });
  }

  try {
    const comment = await createPostComment(user.sub, id, text);
    return { comment };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "Post not found" });
    }
    throw err;
  }
});
