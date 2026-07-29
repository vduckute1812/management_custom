import { clearPostReaction } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

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
      myReaction: post.myReaction,
      reactions: post.reactions,
      reactionCount: post.reactionCount,
    };
  } catch (err: unknown) {
    mapDomainError(err);
  }
});
