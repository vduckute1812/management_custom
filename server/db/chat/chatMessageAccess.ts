/**
 * Chat message access: get for participant, delete, assert reachable.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import type { ChatMessage } from "~/types/chat";
import { dbToISO } from "../core/datetime";
import { getPool } from "../core/pool";
import { purgeOrphanedUploads } from "../feed/uploads";
import type { MessageRow } from "./chatShared";
import {
  assertParticipantAndFriends,
  loadConversationRow,
  loadMessageReactionMaps,
  toMessage,
} from "./chatShared";

export async function getChatMessageForParticipant(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<ChatMessage | null> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) return null;
  try {
    await assertParticipantAndFriends(conv, userId);
  } catch {
    return null;
  }

  const peerId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
  const pool = getPool();
  const [peerReadRows] = await pool.query<RowDataPacket[]>(
    `SELECT last_read_at FROM chat_conversation_reads
     WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
    [conversationId, peerId],
  );
  const peerLastReadAt = peerReadRows[0]?.last_read_at
    ? dbToISO(String(peerReadRows[0].last_read_at))
    : null;

  const [rows] = await pool.query<MessageRow[]>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.kind, m.body, m.sticker_id,
            m.upload_id, m.duration_ms, m.created_at,
            u.file_name AS upl_file_name, u.mime AS upl_mime,
            u.kind AS upl_kind, u.size_bytes AS upl_size_bytes
     FROM chat_messages m
     LEFT JOIN uploads u ON u.id = m.upload_id
     WHERE m.id = ? AND m.conversation_id = ?
     LIMIT 1`,
    [messageId, conversationId],
  );
  const row = rows[0];
  if (!row) return null;

  const { counts, mine } = await loadMessageReactionMaps([messageId], userId);
  return toMessage(
    row,
    userId,
    peerLastReadAt,
    counts.get(messageId),
    mine.get(messageId) ?? null,
  );
}

/**
 * Hard-delete a message sent by `userId`. Returns the `uploadId` of any
 * attachment so the caller can trigger orphan cleanup, and whether the deleted
 * message was the conversation's `last_message_id` pointer.
 *
 * Returns `404` for non-existent messages AND for messages the caller did not
 * send (matching the reactions-style "not found" response to avoid leaking
 * whether a message exists).
 */
export async function deleteMessage(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<{ uploadId: string | null; wasLastMessage: boolean }> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    throw new DomainError(404, "Message not found");
  }
  await assertParticipantAndFriends(conv, userId);

  const pool = getPool();

  // Load the message — must exist AND belong to the caller.
  const [msgRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, upload_id, sender_id
     FROM chat_messages
     WHERE id = ? AND conversation_id = ?
     LIMIT 1`,
    [messageId, conversationId],
  );
  const msg = msgRows[0];
  if (!msg || msg.sender_id !== userId) {
    throw new DomainError(404, "Message not found");
  }
  const uploadId: string | null = msg.upload_id ?? null;

  // Check whether this message is the conversation's last_message_id pointer.
  const [convRows] = await pool.query<RowDataPacket[]>(
    `SELECT last_message_id FROM chat_conversations WHERE id = ? LIMIT 1`,
    [conversationId],
  );
  const wasLastMessage = convRows[0]?.last_message_id === messageId;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `DELETE FROM chat_messages
       WHERE id = ? AND conversation_id = ? AND sender_id = ?`,
      [messageId, conversationId, userId],
    );

    // If this was the last message, update the pointer to the next newest.
    if (wasLastMessage) {
      const [remaining] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM chat_messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [conversationId],
      );
      const newLastId = remaining[0]?.id ?? null;
      await conn.query(
        `UPDATE chat_conversations SET last_message_id = ? WHERE id = ?`,
        [newLastId, conversationId],
      );
    }

    // Recount unread for BOTH participants (mirrors migration 0015 formula).
    await conn.query(
      `UPDATE chat_conversation_reads r
       SET unread_count = (
         SELECT COUNT(*) FROM chat_messages m
         WHERE m.conversation_id = r.conversation_id
           AND m.sender_id <> r.user_id
           AND m.created_at > r.last_read_at
       )
       WHERE r.conversation_id = ?`,
      [conversationId],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  if (uploadId) {
    await purgeOrphanedUploads([uploadId]);
  }

  return { uploadId, wasLastMessage };
}

/** Participant + message existence only — skips reaction/upload hydrate. */
export async function assertChatMessageAccessible(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    throw new DomainError(404, "Message not found");
  }
  try {
    await assertParticipantAndFriends(conv, userId);
  } catch {
    throw new DomainError(404, "Message not found");
  }
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM chat_messages
     WHERE id = ? AND conversation_id = ?
     LIMIT 1`,
    [messageId, conversationId],
  );
  if (!rows.length) {
    throw new DomainError(404, "Message not found");
  }
}
