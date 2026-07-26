import { z } from "zod";
import { setStoryReaction } from "~/server/utils/db";
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
    throw createError({ statusCode: 400, statusMessage: "Story id required" });
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
    const story = await setStoryReaction(
      user.sub,
      id,
      parsed.data.reaction as (typeof POST_REACTION_TYPES)[number]
    );
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
