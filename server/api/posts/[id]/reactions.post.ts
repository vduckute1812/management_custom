import { setPostReaction } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { postReactionBodySchema } from "~/server/schemas";
import type { PostReactionType } from "~/types/post";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const body = await parseBody(event, postReactionBodySchema);

  try {
    const post = await setPostReaction(
      user.sub,
      id,
      body.reaction as PostReactionType,
    );
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
