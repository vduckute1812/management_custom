import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { postPatchBodySchema } from "~/server/schemas";
import { updatePostForUser } from "~/server/services/postService";
import { POST_FONT_FAMILIES, POST_TEXT_COLORS } from "~/types/post";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  try {
    const data = await parseBody(event, postPatchBodySchema);
    return await updatePostForUser(user.sub, id, {
      body: data.body,
      title: data.title ?? null,
      visibility: data.visibility,
      audienceUserIds: data.audienceUserIds,
      attachmentIds: data.attachmentIds,
      categoryId: data.categoryId ?? null,
      fontFamily: data.fontFamily as (typeof POST_FONT_FAMILIES)[number],
      textColor: data.textColor as (typeof POST_TEXT_COLORS)[number],
    });
  } catch (err) {
    mapDomainError(err);
  }
});
