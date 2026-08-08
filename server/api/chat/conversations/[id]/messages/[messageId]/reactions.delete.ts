import { clearChatMessageReaction } from "~/server/utils/db";
import { publishChatMessageReaction } from "~/server/services/chat/chatService";
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
    const message = await clearChatMessageReaction(
      user.sub,
      conversationId,
      messageId,
    );
    publishChatMessageReaction(user.sub, message);
    return {
      message,
      myReaction: message.myReaction,
      reactions: message.reactions,
      reactionCount: message.reactionCount,
    };
  } catch (err: unknown) {
    mapDomainError(err);
  }
});
