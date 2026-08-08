import { deleteChatMessage } from "~/server/services/chat/chatService";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const conversationId = getRouterParam(event, "id");
  const messageId = getRouterParam(event, "messageId");
  if (!conversationId || !messageId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Conversation and message id required",
    });
  }

  try {
    return await deleteChatMessage(user.sub, conversationId, messageId);
  } catch (err: unknown) {
    mapDomainError(err);
  }
});
