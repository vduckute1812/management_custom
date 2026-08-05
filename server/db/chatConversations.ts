import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import type { ChatConversation } from "~/types/chat";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import { areFriends, listAcceptedFriendIds } from "./friendships";
import type { ConversationRow } from "./chatShared";
import {
  loadConversationRow,
  orderedPair,
  toPeer,
  toMessage,
} from "./chatShared";

const CONVERSATION_SELECT = `SELECT
       c.id,
       c.user_a_id,
       c.user_b_id,
       c.last_message_at,
       c.created_at,
       peer.id AS peer_id,
       peer.name AS peer_name,
       peer.email AS peer_email,
       peer.avatar_upload_id AS peer_avatar_upload_id,
       lm.id AS last_msg_id,
       lm.sender_id AS last_msg_sender_id,
       lm.kind AS last_msg_kind,
       lm.body AS last_msg_body,
       lm.sticker_id AS last_msg_sticker_id,
       lm.upload_id AS last_msg_upload_id,
       lm.duration_ms AS last_msg_duration_ms,
       lm.created_at AS last_msg_created_at,
       lu.file_name AS last_upl_file_name,
       lu.mime AS last_upl_mime,
       lu.kind AS last_upl_kind,
       lu.size_bytes AS last_upl_size_bytes,
       peer_read.last_read_at AS peer_last_read_at,
       COALESCE(my_read.unread_count, 0) AS unread_count
     FROM chat_conversations c
     INNER JOIN users peer
       ON peer.id = IF(c.user_a_id = ?, c.user_b_id, c.user_a_id)
     LEFT JOIN chat_conversation_reads peer_read
       ON peer_read.conversation_id = c.id
      AND peer_read.user_id = peer.id
     LEFT JOIN chat_conversation_reads my_read
       ON my_read.conversation_id = c.id
      AND my_read.user_id = ?
     LEFT JOIN chat_messages lm ON lm.id = c.last_message_id
     LEFT JOIN uploads lu ON lu.id = lm.upload_id`;

function rowToConversation(
  row: ConversationRow,
  userId: string,
): ChatConversation {
  const peerLastReadAt = row.peer_last_read_at
    ? dbToISO(row.peer_last_read_at)
    : null;
  return {
    id: row.id,
    peer: toPeer(row),
    lastMessage:
      row.last_msg_id && row.last_msg_sender_id != null
        ? toMessage(
            {
              id: row.last_msg_id,
              conversation_id: row.id,
              sender_id: row.last_msg_sender_id,
              kind: row.last_msg_kind ?? 0,
              body: row.last_msg_body,
              sticker_id: row.last_msg_sticker_id,
              upload_id: row.last_msg_upload_id,
              duration_ms: row.last_msg_duration_ms,
              created_at: row.last_msg_created_at!,
              upl_file_name: row.last_upl_file_name,
              upl_mime: row.last_upl_mime,
              upl_kind: row.last_upl_kind,
              upl_size_bytes: row.last_upl_size_bytes,
            },
            userId,
            peerLastReadAt,
          )
        : null,
    lastMessageAt: row.last_message_at ? dbToISO(row.last_message_at) : null,
    unreadCount: Number(row.unread_count ?? 0),
    peerLastReadAt,
    createdAt: dbToISO(row.created_at),
  };
}

export async function listConversations(
  userId: string,
): Promise<ChatConversation[]> {
  const pool = getPool();
  const [rows, friendIds] = await Promise.all([
    pool.query<ConversationRow[]>(
      `${CONVERSATION_SELECT}
     WHERE c.user_a_id = ? OR c.user_b_id = ?
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [userId, userId, userId, userId],
    ),
    listAcceptedFriendIds(userId),
  ]);
  const friends = new Set(friendIds);
  // Hide threads whose peer is no longer an accepted friend.
  return rows[0]
    .map((row) => rowToConversation(row, userId))
    .filter((c) => friends.has(c.peer.id));
}

/** Load one conversation the user participates in (no full-list scan). */
export async function getConversationForUser(
  userId: string,
  conversationId: string,
): Promise<ChatConversation | null> {
  const pool = getPool();
  const [rows] = await pool.query<ConversationRow[]>(
    `${CONVERSATION_SELECT}
     WHERE c.id = ?
       AND (c.user_a_id = ? OR c.user_b_id = ?)
     LIMIT 1`,
    [userId, userId, conversationId, userId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const conversation = rowToConversation(row, userId);
  if (!(await areFriends(userId, conversation.peer.id))) {
    return null;
  }
  return conversation;
}

export async function getOrCreateDirectConversation(
  userId: string,
  peerId: string,
): Promise<ChatConversation> {
  if (userId === peerId) {
    throw new DomainError(400, "Cannot chat with yourself");
  }

  // Chat is friends-only (same social graph as stories / Friends visibility).
  if (!(await areFriends(userId, peerId))) {
    throw new DomainError(403, "Friends only");
  }

  const pool = getPool();
  const [peerRows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE id = ? LIMIT 1",
    [peerId],
  );
  if (!peerRows.length) {
    throw new DomainError(404, "User not found");
  }

  const [a, b] = orderedPair(userId, peerId);
  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM chat_conversations WHERE user_a_id = ? AND user_b_id = ? LIMIT 1",
    [a, b],
  );
  if (existing.length) {
    const existingRow = existing[0];
    if (existingRow) {
      const found = await getConversationForUser(
        userId,
        String(existingRow.id),
      );
      if (found) return found;
    }
  }

  const id = generateId("chat");
  const now = nowISO();
  try {
    await pool.query(
      `INSERT INTO chat_conversations (id, user_a_id, user_b_id, last_message_at, created_at)
       VALUES (?, ?, ?, NULL, ?)`,
      [id, a, b, isoToDB(now)],
    );
  } catch (err: unknown) {
    // Race: another request created the same pair — re-read.
    const code = (err as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      const [again] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM chat_conversations WHERE user_a_id = ? AND user_b_id = ? LIMIT 1",
        [a, b],
      );
      const againId = again[0]?.id;
      if (againId) {
        const byId = await getConversationForUser(userId, String(againId));
        if (byId) return byId;
      }
    }
    throw err;
  }

  const created = await getConversationForUser(userId, id);
  if (!created) {
    throw new DomainError(500, "Failed to create conversation");
  }
  return created;
}

export async function getPeerUserId(
  conversationId: string,
  userId: string,
): Promise<string | null> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) return null;
  if (conv.user_a_id !== userId && conv.user_b_id !== userId) return null;
  return conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
}
