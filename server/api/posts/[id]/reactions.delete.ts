import { clearPostReaction } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  try {
    const post = await clearPostReaction(user.sub, id);
    return {
      post,
      liked: false,
      likeCount: post.reactions.like,
      myReaction: post.myReaction,
      reactions: post.reactions,
      reactionCount: post.reactionCount,
    };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "Post not found" });
    }
    throw err;
  }
});
