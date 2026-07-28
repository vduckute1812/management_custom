import { markConversationRead } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Conversation id required",
    });
  }
  try {
    const result = await markConversationRead(user.sub, id);
    return result;
  } catch (err) {
    mapDomainError(err);
  }
});
