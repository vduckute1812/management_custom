import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { postShareBodySchema } from "~/server/schemas";
import { sharePostForUser } from "~/server/services/feed/postService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  try {
    const data = await parseBody(event, postShareBodySchema);
    return await sharePostForUser(user.sub, id, {
      body: data.body,
      visibility: data.visibility,
      audienceUserIds: data.audienceUserIds,
    });
  } catch (err) {
    mapDomainError(err);
  }
});
