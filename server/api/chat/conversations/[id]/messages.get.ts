import { listMessages, markConversationRead } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseQuery, mapDomainError } from "~/server/utils/http";
import { chatMessagesQuerySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Conversation id required",
    });
  }
  const query = parseQuery(event, chatMessagesQuerySchema);
  try {
    const result = await listMessages(user.sub, id, {
      limit: query.limit,
      before: query.before,
      after: query.after,
    });
    // Opening the thread marks it read (unless this is a silent poll with after=)
    if (!query.after) {
      await markConversationRead(user.sub, id);
    }
    return result;
  } catch (err) {
    mapDomainError(err);
  }
});
