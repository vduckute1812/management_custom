/**
 * Direct-message chat (1:1 conversations, messages, read receipts).
 */
import type { RowDataPacket } from "mysql2/promise";
import {
  ChatMessageKind,
  CHAT_STICKER_IDS,
  type ChatConversation,
  type ChatMessage,
  type ChatPeer,
} from "~/types/chat";
import { isoToDB, dbToISO } from "./datetime";
import { generateId, nowISO } from "./ids";
import { avatarUrlFromUploadId } from "./mappers";
import { getPool } from "./pool";

interface ConversationRow extends RowDataPacket {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string | null;
  created_at: string;
  peer_id: string;
  peer_name: string | null;
  peer_email: string;
  peer_avatar_upload_id: string | null;
  last_msg_id: string | null;
  last_msg_sender_id: string | null;
  last_msg_kind: number | null;
  last_msg_body: string | null;
  last_msg_sticker_id: string | null;
  last_msg_created_at: string | null;
  unread_count: number;
  peer_last_read_at: string | null;
}

interface MessageRow extends RowDataPacket {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: number;
  body: string | null;
  sticker_id: string | null;
  created_at: string;
}

function toKind(n: unknown): ChatMessageKind {
  const v = Number(n);
  if (v === ChatMessageKind.Emoji) return ChatMessageKind.Emoji;
  if (v === ChatMessageKind.Sticker) return ChatMessageKind.Sticker;
  return ChatMessageKind.Text;
}

function toPeer(row: {
  peer_id: string;
  peer_name: string | null;
  peer_email: string;
  peer_avatar_upload_id: string | null;
}): ChatPeer {
  return {
    id: row.peer_id,
    name: row.peer_name,
    email: row.peer_email,
    avatarUrl: avatarUrlFromUploadId(row.peer_avatar_upload_id) ?? null,
  };
}

function toMessage(
  row:
    | MessageRow
    | {
        id: string;
        conversation_id: string;
        sender_id: string;
        kind: number;
        body: string | null;
        sticker_id: string | null;
        created_at: string;
      },
  viewerId?: string,
  peerLastReadAtIso?: string | null,
): ChatMessage {
  const createdAt = dbToISO(row.created_at);
  const mine = viewerId ? row.sender_id === viewerId : false;
  let readByPeer: boolean | undefined;
  if (mine && peerLastReadAtIso) {
    readByPeer =
      new Date(createdAt).getTime() <= new Date(peerLastReadAtIso).getTime();
  } else if (mine) {
    readByPeer = false;
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: toKind(row.kind),
    body: row.body,
    stickerId: row.sticker_id,
    createdAt,
    ...(viewerId ? { mine } : {}),
    ...(readByPeer !== undefined ? { readByPeer } : {}),
  };
}

function orderedPair(userId: string, peerId: string): [string, string] {
  return userId < peerId ? [userId, peerId] : [peerId, userId];
}

function assertParticipant(
  row: { user_a_id: string; user_b_id: string },
  userId: string,
): void {
  if (row.user_a_id !== userId && row.user_b_id !== userId) {
    const err = new Error("Conversation not found") as Error & {
      statusCode?: number;
    };
    err.statusCode = 404;
    throw err;
  }
}

export async function listConversations(
  userId: string,
): Promise<ChatConversation[]> {
  const pool = getPool();
  const [rows] = await pool.query<ConversationRow[]>(
    `SELECT
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
       lm.created_at AS last_msg_created_at,
       peer_read.last_read_at AS peer_last_read_at,
       (
         SELECT COUNT(*)
         FROM chat_messages m
         LEFT JOIN chat_conversation_reads r
           ON r.conversation_id = c.id AND r.user_id = ?
         WHERE m.conversation_id = c.id
           AND m.sender_id <> ?
           AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
       ) AS unread_count
     FROM chat_conversations c
     INNER JOIN users peer
       ON peer.id = IF(c.user_a_id = ?, c.user_b_id, c.user_a_id)
     LEFT JOIN chat_conversation_reads peer_read
       ON peer_read.conversation_id = c.id
      AND peer_read.user_id = peer.id
     LEFT JOIN chat_messages lm
       ON lm.id = (
         SELECT m2.id FROM chat_messages m2
         WHERE m2.conversation_id = c.id
         ORDER BY m2.created_at DESC, m2.id DESC
         LIMIT 1
       )
     WHERE c.user_a_id = ? OR c.user_b_id = ?
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
    [userId, userId, userId, userId, userId],
  );

  return rows.map((row) => {
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
                created_at: row.last_msg_created_at!,
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
  });
}

export async function getOrCreateDirectConversation(
  userId: string,
  peerId: string,
): Promise<ChatConversation> {
  if (userId === peerId) {
    const err = new Error("Cannot chat with yourself") as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const pool = getPool();
  const [peerRows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE id = ? LIMIT 1",
    [peerId],
  );
  if (!peerRows.length) {
    const err = new Error("User not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const [a, b] = orderedPair(userId, peerId);
  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM chat_conversations WHERE user_a_id = ? AND user_b_id = ? LIMIT 1",
    [a, b],
  );
  if (existing.length) {
    const list = await listConversations(userId);
    const found = list.find((c) => c.id === String(existing[0].id));
    if (found) return found;
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
      const again = await listConversations(userId);
      const byPeer = again.find((c) => c.peer.id === peerId);
      if (byPeer) return byPeer;
    }
    throw err;
  }

  const list = await listConversations(userId);
  const created = list.find((c) => c.id === id || c.peer.id === peerId);
  if (!created) {
    const err = new Error("Failed to create conversation") as Error & {
      statusCode?: number;
    };
    err.statusCode = 500;
    throw err;
  }
  return created;
}

async function loadConversationRow(
  conversationId: string,
): Promise<{ id: string; user_a_id: string; user_b_id: string } | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, user_a_id, user_b_id FROM chat_conversations WHERE id = ? LIMIT 1",
    [conversationId],
  );
  if (!rows.length) return null;
  return {
    id: String(rows[0].id),
    user_a_id: String(rows[0].user_a_id),
    user_b_id: String(rows[0].user_b_id),
  };
}

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
    const err = new Error("Conversation not found") as Error & {
      statusCode?: number;
    };
    err.statusCode = 404;
    throw err;
  }
  assertParticipant(conv, userId);

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
    if (cursorRows.length) {
      params.push(
        cursorRows[0].created_at,
        cursorRows[0].created_at,
        cursorRows[0].id,
      );
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
    if (cursorRows.length) {
      params.push(
        cursorRows[0].created_at,
        cursorRows[0].created_at,
        cursorRows[0].id,
      );
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
    `SELECT m.id, m.conversation_id, m.sender_id, m.kind, m.body, m.sticker_id, m.created_at
     FROM chat_messages m
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

  return {
    messages: chronological.map((r) => toMessage(r, userId, peerLastReadAt)),
    hasMore: options.after ? false : hasMore,
    peerLastReadAt,
  };
}

export interface SendMessageInput {
  kind: ChatMessageKind;
  body?: string | null;
  stickerId?: string | null;
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<ChatMessage> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    const err = new Error("Conversation not found") as Error & {
      statusCode?: number;
    };
    err.statusCode = 404;
    throw err;
  }
  assertParticipant(conv, userId);

  let body: string | null = null;
  let stickerId: string | null = null;

  if (input.kind === ChatMessageKind.Sticker) {
    const sid = (input.stickerId || "").trim();
    if (!CHAT_STICKER_IDS.has(sid)) {
      const err = new Error("Unknown sticker") as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    stickerId = sid;
  } else {
    const text = (input.body || "").trim();
    if (!text) {
      const err = new Error("Message body is required") as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    body = text;
  }

  const id = generateId("msg");
  const now = nowISO();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO chat_messages
         (id, conversation_id, sender_id, kind, body, sticker_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, conversationId, userId, input.kind, body, stickerId, isoToDB(now)],
    );
    await conn.query(
      `UPDATE chat_conversations SET last_message_at = ? WHERE id = ?`,
      [isoToDB(now), conversationId],
    );
    // Sender has read up to now
    await conn.query(
      `INSERT INTO chat_conversation_reads (conversation_id, user_id, last_read_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
      [conversationId, userId, isoToDB(now)],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    id,
    conversationId,
    senderId: userId,
    kind: input.kind,
    body,
    stickerId,
    createdAt: now,
    mine: true,
    readByPeer: false,
  };
}

export async function markConversationRead(
  userId: string,
  conversationId: string,
): Promise<{ lastReadAt: string }> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    const err = new Error("Conversation not found") as Error & {
      statusCode?: number;
    };
    err.statusCode = 404;
    throw err;
  }
  assertParticipant(conv, userId);

  const now = nowISO();
  const pool = getPool();
  await pool.query(
    `INSERT INTO chat_conversation_reads (conversation_id, user_id, last_read_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
    [conversationId, userId, isoToDB(now)],
  );
  return { lastReadAt: now };
}

export async function getUnreadTotal(userId: string): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n
     FROM chat_messages m
     INNER JOIN chat_conversations c ON c.id = m.conversation_id
     LEFT JOIN chat_conversation_reads r
       ON r.conversation_id = c.id AND r.user_id = ?
     WHERE (c.user_a_id = ? OR c.user_b_id = ?)
       AND m.sender_id <> ?
       AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)`,
    [userId, userId, userId, userId],
  );
  return Number(rows[0]?.n ?? 0);
}

export interface ChatUnreadPreview {
  conversationId: string;
  peerName: string | null;
  peerEmail: string;
  preview: string;
  createdAt: string;
}

/** Lightweight inbox pulse for nav badge + toast notifications. */
export async function getUnreadInbox(
  userId: string,
): Promise<{ unreadTotal: number; latest: ChatUnreadPreview | null }> {
  const unreadTotal = await getUnreadTotal(userId);
  if (unreadTotal <= 0) {
    return { unreadTotal: 0, latest: null };
  }

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       m.conversation_id AS conversation_id,
       m.kind AS kind,
       m.body AS body,
       m.sticker_id AS sticker_id,
       m.created_at AS created_at,
       peer.name AS peer_name,
       peer.email AS peer_email
     FROM chat_messages m
     INNER JOIN chat_conversations c ON c.id = m.conversation_id
     INNER JOIN users peer
       ON peer.id = IF(c.user_a_id = ?, c.user_b_id, c.user_a_id)
     LEFT JOIN chat_conversation_reads r
       ON r.conversation_id = c.id AND r.user_id = ?
     WHERE (c.user_a_id = ? OR c.user_b_id = ?)
       AND m.sender_id <> ?
       AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 1`,
    [userId, userId, userId, userId, userId],
  );

  if (!rows.length) {
    return { unreadTotal, latest: null };
  }

  const row = rows[0];
  const kind = Number(row.kind ?? 0);
  let preview = "";
  if (kind === ChatMessageKind.Sticker) {
    preview = "🎨";
  } else if (kind === ChatMessageKind.Emoji) {
    preview = String(row.body ?? "");
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
