import { setStoryReaction } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { postReactionBodySchema } from "~/server/schemas";
import type { ReactionType } from "~/types/reaction";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Story id required" });
  }

  const body = await parseBody(event, postReactionBodySchema);

  try {
    const story = await setStoryReaction(
      user.sub,
      id,
      body.reaction as ReactionType,
    );
    return {
      story,
      myReaction: story.myReaction,
      reactions: story.reactions,
      reactionCount: story.reactionCount,
    };
  } catch (err: unknown) {
    mapDomainError(err);
  }
});
