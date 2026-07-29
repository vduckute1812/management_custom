/**
 * Chat send / read workflows that also fan out inbox SSE updates.
 */
import {
  getPeerUserId,
  markConversationRead,
  sendMessage,
  type SendMessageInput,
} from "~/server/utils/db";
import { refreshAndPushInbox } from "~/server/utils/chatInbox";
import type { ChatMessage } from "~/types/chat";

export async function sendChatMessage(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<ChatMessage> {
  const message = await sendMessage(userId, conversationId, input);
  const peerId = await getPeerUserId(conversationId, userId);
  if (peerId) {
    void refreshAndPushInbox(peerId);
  }
  return message;
}

export async function markChatConversationRead(
  userId: string,
  conversationId: string,
): Promise<{ lastReadAt: string }> {
  const result = await markConversationRead(userId, conversationId);
  void refreshAndPushInbox(userId);
  return result;
}
