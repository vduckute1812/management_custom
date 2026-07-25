import { createPost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const body = await readBody<{ body?: string }>(event);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (text.length > 5000) {
    throw createError({
      statusCode: 400,
      statusMessage: "Share note must be 5000 characters or fewer",
    });
  }

  try {
    const post = await createPost(user.sub, text || "Shared a post", id);
    return { post };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: "Original post not found",
      });
    }
    throw err;
  }
});
