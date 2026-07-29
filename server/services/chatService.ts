/**
 * Chat send / read workflows that fan out inbox + thread SSE updates.
 */
import {
  getPeerUserId,
  markConversationRead,
  sendMessage,
  type SendMessageInput,
} from "~/server/utils/db";
import { refreshAndPushInbox } from "~/server/utils/chatInbox";
import { publishChatThread } from "~/server/utils/chatThread";
import type { ChatMessage } from "~/types/chat";

function wireMessage(message: ChatMessage): ChatMessage {
  // Omit viewer-specific flags — each client derives `mine` / `readByPeer`.
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    kind: message.kind,
    body: message.body,
    stickerId: message.stickerId,
    uploadId: message.uploadId,
    durationMs: message.durationMs,
    attachment: message.attachment,
    createdAt: message.createdAt,
  };
}

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
  publishChatThread(conversationId, {
    type: "message",
    message: wireMessage(message),
  });
  return message;
}

export async function markChatConversationRead(
  userId: string,
  conversationId: string,
): Promise<{ lastReadAt: string }> {
  const result = await markConversationRead(userId, conversationId);
  void refreshAndPushInbox(userId);
  publishChatThread(conversationId, {
    type: "read",
    userId,
    lastReadAt: result.lastReadAt,
  });
  return result;
}
