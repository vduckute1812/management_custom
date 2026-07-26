import { clearStoryReaction } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Story id required" });
  }

  try {
    const story = await clearStoryReaction(user.sub, id);
    return {
      story,
      myReaction: story.myReaction,
      reactions: story.reactions,
      reactionCount: story.reactionCount,
    };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "Story not found" });
    }
    throw err;
  }
});
