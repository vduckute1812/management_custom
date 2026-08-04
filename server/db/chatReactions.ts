/**
 * Chat message reaction set / clear.
 */
import { DomainError } from "~/server/utils/http";
import type { ChatMessage, ChatMessageReactionType } from "~/types/chat";
import { CHAT_REACTION_TYPES } from "~/types/chat";
import { isoToDB } from "./datetime";
import { nowISO } from "./ids";
import { getPool } from "./pool";
import {
  assertChatMessageAccessible,
  getChatMessageForParticipant,
} from "./chatMessages";

export async function setChatMessageReaction(
  userId: string,
  conversationId: string,
  messageId: string,
  reaction: ChatMessageReactionType,
): Promise<ChatMessage> {
  if (!CHAT_REACTION_TYPES.includes(reaction)) {
    throw new DomainError(400, "Invalid reaction");
  }
  await assertChatMessageAccessible(userId, conversationId, messageId);

  const pool = getPool();
  await pool.query(
    `INSERT INTO chat_message_reactions (message_id, user_id, reaction, created_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reaction = VALUES(reaction), created_at = VALUES(created_at)`,
    [messageId, userId, reaction, isoToDB(nowISO())],
  );

  const refreshed = await getChatMessageForParticipant(
    userId,
    conversationId,
    messageId,
  );
  if (!refreshed) {
    throw new DomainError(404, "Message not found");
  }
  return refreshed;
}

export async function clearChatMessageReaction(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<ChatMessage> {
  await assertChatMessageAccessible(userId, conversationId, messageId);

  const pool = getPool();
  await pool.query(
    "DELETE FROM chat_message_reactions WHERE message_id = ? AND user_id = ?",
    [messageId, userId],
  );

  const refreshed = await getChatMessageForParticipant(
    userId,
    conversationId,
    messageId,
  );
  if (!refreshed) {
    throw new DomainError(404, "Message not found");
  }
  return refreshed;
}
