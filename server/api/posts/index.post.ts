import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { postCreateBodySchema } from "~/server/schemas";
import { createPostForUser } from "~/server/services/postService";
import {
  POST_FONT_FAMILIES,
  POST_FORMATS,
  POST_TEXT_COLORS,
} from "~/types/post";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const data = await parseBody(event, postCreateBodySchema);
    return await createPostForUser(user.sub, {
      body: data.body,
      title: data.title ?? null,
      format: data.format as (typeof POST_FORMATS)[number],
      visibility: data.visibility,
      audienceUserIds: data.audienceUserIds,
      attachmentIds: data.attachmentIds,
      categoryId: data.categoryId ?? null,
      fontFamily: data.fontFamily as (typeof POST_FONT_FAMILIES)[number],
      textColor: data.textColor as (typeof POST_TEXT_COLORS)[number],
      contentLocale: data.contentLocale ?? null,
      translationGroupId: data.translationGroupId ?? null,
    });
  } catch (err) {
    mapDomainError(err);
  }
});
