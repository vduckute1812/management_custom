/**
 * Chat message listing (cursor pagination).
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import type { ChatMessage } from "~/types/chat";
import type { MessageRow } from "./chatShared";
import {
  assertParticipantAndFriends,
  loadConversationRow,
  loadMessageReactionMaps,
  toMessage,
} from "./chatShared";
import { dbToISO, isoToDB } from "../core/datetime";
import { getPool } from "../core/pool";

export async function listMessages(
  userId: string,
  conversationId: string,
  options: { limit?: number; before?: string; after?: string } = {},
): Promise<{
  messages: ChatMessage[];
  hasMore: boolean;
  peerLastReadAt: string | null;
}> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    throw new DomainError(404, "Conversation not found");
  }
  await assertParticipantAndFriends(conv, userId);

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

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  const params: unknown[] = [conversationId];
  let timeClause = "";
  if (options.after) {
    timeClause = "AND (m.created_at > ? OR (m.created_at = ? AND m.id > ?))";
    // Resolve after cursor: treat as message id preferentially
    const [cursorRows] = await pool.query<MessageRow[]>(
      "SELECT id, created_at FROM chat_messages WHERE id = ? AND conversation_id = ? LIMIT 1",
      [options.after, conversationId],
    );
    const cursor = cursorRows[0];
    if (cursor) {
      params.push(cursor.created_at, cursor.created_at, cursor.id);
    } else {
      // ISO timestamp fallback
      params.push(isoToDB(options.after), isoToDB(options.after), "");
    }
  } else if (options.before) {
    timeClause = "AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))";
    const [cursorRows] = await pool.query<MessageRow[]>(
      "SELECT id, created_at FROM chat_messages WHERE id = ? AND conversation_id = ? LIMIT 1",
      [options.before, conversationId],
    );
    const cursor = cursorRows[0];
    if (cursor) {
      params.push(cursor.created_at, cursor.created_at, cursor.id);
    } else {
      params.push(isoToDB(options.before), isoToDB(options.before), "");
    }
  }

  params.push(limit + 1);

  // Fetch newest-first for "before"/initial, oldest-first for "after" polls
  const order =
    options.after != null
      ? "ORDER BY m.created_at ASC, m.id ASC"
      : "ORDER BY m.created_at DESC, m.id DESC";

  const [rows] = await pool.query<MessageRow[]>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.kind, m.body, m.sticker_id,
            m.upload_id, m.duration_ms, m.created_at,
            u.file_name AS upl_file_name, u.mime AS upl_mime,
            u.kind AS upl_kind, u.size_bytes AS upl_size_bytes
     FROM chat_messages m
     LEFT JOIN uploads u ON u.id = m.upload_id
     WHERE m.conversation_id = ?
       ${timeClause}
     ${order}
     LIMIT ?`,
    params,
  );

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  // Always return chronological ascending for the UI
  const chronological = options.after ? slice : [...slice].reverse();

  const { counts, mine } = await loadMessageReactionMaps(
    chronological.map((r) => r.id),
    userId,
  );

  return {
    messages: chronological.map((r) =>
      toMessage(
        r,
        userId,
        peerLastReadAt,
        counts.get(r.id),
        mine.get(r.id) ?? null,
      ),
    ),
    hasMore: options.after ? false : hasMore,
    peerLastReadAt,
  };
}
