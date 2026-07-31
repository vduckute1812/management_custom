import { createStory } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { storyCreateBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const data = await parseBody(event, storyCreateBodySchema);
    const story = await createStory(user.sub, {
      body: data.body,
      uploadId: data.uploadId,
    });
    return { story };
  } catch (err) {
    mapDomainError(err);
  }
});
