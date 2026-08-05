/**
 * Chat conversation read receipts and unread inbox.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { ChatMessageKind } from "~/types/chat";
import { dbToISO, isoToDB } from "./datetime";
import { nowISO } from "./ids";
import { getPool } from "./pool";
import { assertParticipantAndFriends, loadConversationRow } from "./chatShared";

export interface ChatUnreadPreview {
  conversationId: string;
  peerName: string | null;
  peerEmail: string;
  preview: string;
  createdAt: string;
}

export async function markConversationRead(
  userId: string,
  conversationId: string,
): Promise<{ lastReadAt: string }> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    throw new DomainError(404, "Conversation not found");
  }
  await assertParticipantAndFriends(conv, userId);

  const now = nowISO();
  const pool = getPool();
  await pool.query(
    `INSERT INTO chat_conversation_reads
       (conversation_id, user_id, last_read_at, unread_count)
     VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE
       last_read_at = VALUES(last_read_at),
       unread_count = 0`,
    [conversationId, userId, isoToDB(now)],
  );
  return { lastReadAt: now };
}

export async function getUnreadTotal(userId: string): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(unread_count), 0) AS n
     FROM chat_conversation_reads
     WHERE user_id = ?`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Lightweight inbox snapshot for nav badge + toast notifications. */
export async function getUnreadInbox(
  userId: string,
): Promise<{ unreadTotal: number; latest: ChatUnreadPreview | null }> {
  const unreadTotal = await getUnreadTotal(userId);
  if (unreadTotal <= 0) {
    return { unreadTotal: 0, latest: null };
  }

  const pool = getPool();
  // Preview only among conversations that still have unread — counters keep
  // the SUM cheap; this query only runs when the badge is non-zero.
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       m.conversation_id AS conversation_id,
       m.kind AS kind,
       m.body AS body,
       m.sticker_id AS sticker_id,
       m.created_at AS created_at,
       peer.name AS peer_name,
       peer.email AS peer_email
     FROM chat_conversation_reads r
     INNER JOIN chat_messages m
       ON m.conversation_id = r.conversation_id
      AND m.sender_id <> r.user_id
      AND m.created_at > r.last_read_at
     INNER JOIN chat_conversations c ON c.id = r.conversation_id
     INNER JOIN users peer
       ON peer.id = IF(c.user_a_id = r.user_id, c.user_b_id, c.user_a_id)
     WHERE r.user_id = ?
       AND r.unread_count > 0
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 1`,
    [userId],
  );

  const row = rows[0];
  if (!row) {
    return { unreadTotal, latest: null };
  }

  const kind = Number(row.kind ?? 0);
  let preview = "";
  if (kind === ChatMessageKind.Sticker) {
    preview = "🎨";
  } else if (kind === ChatMessageKind.Emoji) {
    preview = String(row.body ?? "");
  } else if (kind === ChatMessageKind.Image) {
    preview = "📷";
  } else if (kind === ChatMessageKind.Audio) {
    preview = "🎤";
  } else {
    preview = String(row.body ?? "").trim();
    if (preview.length > 80) preview = `${preview.slice(0, 80)}…`;
  }

  return {
    unreadTotal,
    latest: {
      conversationId: String(row.conversation_id),
      peerName: (row.peer_name as string | null) ?? null,
      peerEmail: String(row.peer_email),
      preview,
      createdAt: dbToISO(String(row.created_at)),
    },
  };
}
