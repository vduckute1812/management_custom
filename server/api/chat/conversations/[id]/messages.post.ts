import { sendChatMessage } from "~/server/services/chatService";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { chatSendBodySchema } from "~/server/schemas";
import type { ChatMessageKind } from "~/types/chat";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Conversation id required",
    });
  }
  const body = await parseBody(event, chatSendBodySchema);
  try {
    const message = await sendChatMessage(user.sub, id, {
      kind: body.kind as ChatMessageKind,
      body: body.body,
      stickerId: body.stickerId,
      uploadId: body.uploadId,
      durationMs: body.durationMs,
    });
    return { message };
  } catch (err) {
    mapDomainError(err);
  }
});
