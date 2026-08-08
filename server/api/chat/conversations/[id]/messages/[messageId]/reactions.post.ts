import { setChatMessageReaction } from "~/server/utils/db";
import { publishChatMessageReaction } from "~/server/services/chat/chatService";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { chatMessageReactionBodySchema } from "~/server/schemas";
import type { ChatMessageReactionType } from "~/types/chat";

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

  const body = await parseBody(event, chatMessageReactionBodySchema);

  try {
    const message = await setChatMessageReaction(
      user.sub,
      conversationId,
      messageId,
      body.reaction as ChatMessageReactionType,
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
