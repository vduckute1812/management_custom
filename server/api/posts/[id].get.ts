import { getPostById } from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";

/** Fetch a single post (used when switching manuscript locale variants). */
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
  return { post };
});
