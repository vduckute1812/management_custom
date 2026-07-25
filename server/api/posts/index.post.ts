import { createPost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<{ body?: string }>(event);
  const text = typeof body?.body === "string" ? body.body.trim() : "";

  if (!text) {
    throw createError({
      statusCode: 400,
      statusMessage: "Post body is required",
    });
  }
  if (text.length > 5000) {
    throw createError({
      statusCode: 400,
      statusMessage: "Post body must be 5000 characters or fewer",
    });
  }

  const post = await createPost(user.sub, text);
  return { post };
});
