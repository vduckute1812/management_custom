import { z } from "zod";
import { setPostReaction } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { POST_REACTION_TYPES } from "~/types/post";

const bodySchema = z.object({
  reaction: z.enum(
    POST_REACTION_TYPES as unknown as [string, ...string[]]
  ),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const raw = await readBody(event);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid reaction",
    });
  }

  try {
    const post = await setPostReaction(
      user.sub,
      id,
      parsed.data.reaction as (typeof POST_REACTION_TYPES)[number]
    );
    return {
      post,
      liked: post.myReaction === "like",
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
