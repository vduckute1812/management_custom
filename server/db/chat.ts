import { DomainError } from "~/server/utils/http";
/**
 * Direct-message chat (1:1 conversations, messages, read receipts).
 */
import type { RowDataPacket } from "mysql2/promise";
import {
  ChatMessageKind,
  CHAT_STICKER_IDS,
  CHAT_VOICE_MAX_MS,
  CHAT_REACTION_TYPES,
  emptyChatReactions,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
  type ChatMessageReactionType,
  type ChatPeer,
} from "~/types/chat";
import { UploadKind, toUploadKind } from "~/types/post";
import { toReactionType } from "~/types/reaction";
import { resolveDisplayName } from "../../utils/displayName";
import { isoToDB, dbToISO } from "./datetime";
import { generateId, nowISO } from "./ids";
import { avatarUrlFromUploadId } from "./mappers";
import { getPool } from "./pool";
import { getUploadById } from "./uploads";

interface ReactionCountRow extends RowDataPacket {
  message_id: string;
  reaction: ChatMessageReactionType;
  cnt: number;
}

interface MyReactionRow extends RowDataPacket {
  message_id: string;
  reaction: ChatMessageReactionType;
}

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
  last_msg_upload_id: string | null;
  last_msg_duration_ms: number | null;
  last_msg_created_at: string | null;
  last_upl_file_name: string | null;
  last_upl_mime: string | null;
  last_upl_kind: UploadKind | null;
  last_upl_size_bytes: number | null;
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
  upload_id: string | null;
  duration_ms: number | null;
  created_at: string;
  upl_file_name: string | null;
  upl_mime: string | null;
  upl_kind: UploadKind | null;
  upl_size_bytes: number | null;
}

function toKind(n: unknown): ChatMessageKind {
  const v = Number(n);
  if (v === ChatMessageKind.Emoji) return ChatMessageKind.Emoji;
  if (v === ChatMessageKind.Sticker) return ChatMessageKind.Sticker;
  if (v === ChatMessageKind.Image) return ChatMessageKind.Image;
  if (v === ChatMessageKind.Audio) return ChatMessageKind.Audio;
  return ChatMessageKind.Text;
}

function toAttachment(args: {
  uploadId: string | null | undefined;
  fileName: string | null | undefined;
  mime: string | null | undefined;
  kind: UploadKind | null | undefined;
  sizeBytes: number | null | undefined;
}): ChatAttachment | null {
  if (!args.uploadId || !args.mime || args.kind == null || !args.fileName) {
    return null;
  }
  const kind = toUploadKind(args.kind);
  return {
    id: args.uploadId,
    url: `/api/uploads/${args.uploadId}`,
    mime: args.mime,
    kind,
    fileName: args.fileName,
    sizeBytes: Number(args.sizeBytes ?? 0),
  };
}

function toPeer(row: {
  peer_id: string;
  peer_name: string | null;
  peer_email: string;
  peer_avatar_upload_id: string | null;
}): ChatPeer {
  return {
    id: row.peer_id,
    name: resolveDisplayName(row.peer_name, row.peer_email),
    email: row.peer_email,
    avatarUrl: avatarUrlFromUploadId(row.peer_avatar_upload_id) ?? null,
  };
}

function toMessage(
  row: {
    id: string;
    conversation_id: string;
    sender_id: string;
    kind: number;
    body: string | null;
    sticker_id: string | null;
    upload_id?: string | null;
    duration_ms?: number | null;
    created_at: string;
    upl_file_name?: string | null;
    upl_mime?: string | null;
    upl_kind?: UploadKind | null;
    upl_size_bytes?: number | null;
  },
  viewerId?: string,
  peerLastReadAtIso?: string | null,
  reactions?: Record<ChatMessageReactionType, number>,
  myReaction?: ChatMessageReactionType | null,
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
  const reactionMap = reactions ?? emptyChatReactions();
  const reactionCount = CHAT_REACTION_TYPES.reduce(
    (sum: number, key) => sum + (reactionMap[key] ?? 0),
    0,
  );
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: toKind(row.kind),
    body: row.body,
    stickerId: row.sticker_id,
    uploadId: row.upload_id ?? null,
    durationMs:
      row.duration_ms !== null && row.duration_ms !== undefined
        ? Number(row.duration_ms)
        : null,
    attachment: toAttachment({
      uploadId: row.upload_id,
      fileName: row.upl_file_name,
      mime: row.upl_mime,
      kind: row.upl_kind,
      sizeBytes: row.upl_size_bytes,
    }),
    createdAt,
    reactions: reactionMap,
    reactionCount,
    myReaction: myReaction ?? null,
    ...(viewerId ? { mine } : {}),
    ...(readByPeer !== undefined ? { readByPeer } : {}),
  };
}

async function loadMessageReactionMaps(
  messageIds: string[],
  viewerId?: string,
): Promise<{
  counts: Map<string, Record<ChatMessageReactionType, number>>;
  mine: Map<string, ChatMessageReactionType>;
}> {
  const counts = new Map<string, Record<ChatMessageReactionType, number>>();
  const mine = new Map<string, ChatMessageReactionType>();
  for (const id of messageIds) counts.set(id, emptyChatReactions());
  if (!messageIds.length) return { counts, mine };

  const pool = getPool();
  const placeholders = messageIds.map(() => "?").join(",");
  const [rows] = await pool.query<ReactionCountRow[]>(
    `SELECT message_id, reaction, COUNT(*) AS cnt
     FROM chat_message_reactions
     WHERE message_id IN (${placeholders})
     GROUP BY message_id, reaction`,
    messageIds,
  );
  for (const row of rows) {
    const reaction = toReactionType(row.reaction);
    if (reaction == null) continue;
    const bucket = counts.get(row.message_id) ?? emptyChatReactions();
    bucket[reaction] = Number(row.cnt);
    counts.set(row.message_id, bucket);
  }

  if (viewerId) {
    const [mineRows] = await pool.query<MyReactionRow[]>(
      `SELECT message_id, reaction
       FROM chat_message_reactions
       WHERE user_id = ? AND message_id IN (${placeholders})`,
      [viewerId, ...messageIds],
    );
    for (const row of mineRows) {
      const reaction = toReactionType(row.reaction);
      if (reaction == null) continue;
      mine.set(row.message_id, reaction);
    }
  }

  return { counts, mine };
}

function orderedPair(userId: string, peerId: string): [string, string] {
  return userId < peerId ? [userId, peerId] : [peerId, userId];
}

function assertParticipant(
  row: { user_a_id: string; user_b_id: string },
  userId: string,
): void {
  if (row.user_a_id !== userId && row.user_b_id !== userId) {
    throw new DomainError(404, "Conversation not found");
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
     LEFT JOIN uploads lu ON lu.id = lm.upload_id
     WHERE c.user_a_id = ? OR c.user_b_id = ?
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
    [userId, userId, userId, userId],
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
  });
}

export async function getOrCreateDirectConversation(
  userId: string,
  peerId: string,
): Promise<ChatConversation> {
  if (userId === peerId) {
    throw new DomainError(400, "Cannot chat with yourself");
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
      const list = await listConversations(userId);
      const found = list.find((c) => c.id === String(existingRow.id));
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
      const again = await listConversations(userId);
      const byPeer = again.find((c) => c.peer.id === peerId);
      if (byPeer) return byPeer;
    }
    throw err;
  }

  const list = await listConversations(userId);
  const created = list.find((c) => c.id === id || c.peer.id === peerId);
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

async function loadConversationRow(
  conversationId: string,
): Promise<{ id: string; user_a_id: string; user_b_id: string } | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, user_a_id, user_b_id FROM chat_conversations WHERE id = ? LIMIT 1",
    [conversationId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    user_a_id: String(row.user_a_id),
    user_b_id: String(row.user_b_id),
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
    throw new DomainError(404, "Conversation not found");
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

export interface SendMessageInput {
  kind: ChatMessageKind;
  body?: string | null;
  stickerId?: string | null;
  uploadId?: string | null;
  durationMs?: number | null;
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<ChatMessage> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    throw new DomainError(404, "Conversation not found");
  }
  assertParticipant(conv, userId);

  let body: string | null = null;
  let stickerId: string | null = null;
  let uploadId: string | null = null;
  let durationMs: number | null = null;
  let attachment: ChatAttachment | null = null;

  if (input.kind === ChatMessageKind.Sticker) {
    const sid = (input.stickerId || "").trim();
    if (!CHAT_STICKER_IDS.has(sid)) {
      throw new DomainError(400, "Unknown sticker");
    }
    stickerId = sid;
  } else if (
    input.kind === ChatMessageKind.Image ||
    input.kind === ChatMessageKind.Audio
  ) {
    const uid = (input.uploadId || "").trim();
    if (!uid) {
      throw new DomainError(400, "uploadId is required");
    }
    const upload = await getUploadById(uid);
    if (!upload || upload.user_id !== userId) {
      throw new DomainError(400, "Upload not found");
    }
    const expectedKind =
      input.kind === ChatMessageKind.Image
        ? UploadKind.Image
        : UploadKind.Audio;
    if (toUploadKind(upload.kind) !== expectedKind) {
      const expectedKindLabel =
        expectedKind === UploadKind.Image ? "image" : "audio";
      throw new DomainError(400, `Upload must be an ${expectedKindLabel} file`);
    }
    // Refuse reuse of an upload already linked to another chat message.
    const poolCheck = getPool();
    const [used] = await poolCheck.query<RowDataPacket[]>(
      `SELECT 1 FROM chat_messages WHERE upload_id = ? LIMIT 1`,
      [uid],
    );
    if (used.length) {
      throw new DomainError(400, "Upload is already attached to a message");
    }
    uploadId = uid;
    if (input.kind === ChatMessageKind.Audio) {
      const d = Number(input.durationMs ?? 0);
      if (!Number.isFinite(d) || d < 200 || d > CHAT_VOICE_MAX_MS) {
        throw new DomainError(400, "Invalid voice duration");
      }
      durationMs = Math.round(d);
    }
    attachment = toAttachment({
      uploadId: uid,
      fileName: upload.file_name,
      mime: upload.mime,
      kind: upload.kind,
      sizeBytes: upload.size_bytes,
    });
  } else {
    const text = (input.body || "").trim();
    if (!text) {
      throw new DomainError(400, "Message body is required");
    }
    body = text;
  }

  const id = generateId("msg");
  const now = nowISO();
  const peerId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO chat_messages
         (id, conversation_id, sender_id, kind, body, sticker_id, upload_id, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        conversationId,
        userId,
        input.kind,
        body,
        stickerId,
        uploadId,
        durationMs,
        isoToDB(now),
      ],
    );
    await conn.query(
      `UPDATE chat_conversations
       SET last_message_at = ?, last_message_id = ?
       WHERE id = ?`,
      [isoToDB(now), id, conversationId],
    );
    // Sender has read up to now; clear their unread counter.
    await conn.query(
      `INSERT INTO chat_conversation_reads
         (conversation_id, user_id, last_read_at, unread_count)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         last_read_at = VALUES(last_read_at),
         unread_count = 0`,
      [conversationId, userId, isoToDB(now)],
    );
    // Peer: bump denormalized unread (epoch last_read if first row).
    await conn.query(
      `INSERT INTO chat_conversation_reads
         (conversation_id, user_id, last_read_at, unread_count)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE unread_count = unread_count + 1`,
      [conversationId, peerId, isoToDB("1970-01-01T00:00:00.000Z")],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    const code = (err as { code?: string })?.code;
    const sqlMessage = (err as { sqlMessage?: string })?.sqlMessage ?? "";
    if (
      code === "ER_DUP_ENTRY" &&
      sqlMessage.includes("uniq_chat_messages_upload")
    ) {
      throw new DomainError(400, "Upload is already attached to a message");
    }
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
    uploadId,
    durationMs,
    attachment,
    createdAt: now,
    reactions: emptyChatReactions(),
    reactionCount: 0,
    myReaction: null,
    mine: true,
    readByPeer: false,
  };
}

export async function getChatMessageForParticipant(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<ChatMessage | null> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) return null;
  try {
    assertParticipant(conv, userId);
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

/** Participant + message existence only — skips reaction/upload hydrate. */
async function assertChatMessageAccessible(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    throw new DomainError(404, "Message not found");
  }
  try {
    assertParticipant(conv, userId);
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

export async function markConversationRead(
  userId: string,
  conversationId: string,
): Promise<{ lastReadAt: string }> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    throw new DomainError(404, "Conversation not found");
  }
  assertParticipant(conv, userId);

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

export interface ChatUnreadPreview {
  conversationId: string;
  peerName: string | null;
  peerEmail: string;
  preview: string;
  createdAt: string;
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
