/**
 * Chat message list, send, and retrieval.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import {
  ChatMessageKind,
  CHAT_STICKER_IDS,
  CHAT_VOICE_MAX_MS,
  emptyChatReactions,
  type ChatAttachment,
  type ChatMessage,
} from "~/types/chat";
import { UploadKind, toUploadKind } from "~/types/post";
import { dbToISO, isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { getUploadById, purgeOrphanedUploads } from "../feed/uploads";
import type { MessageRow } from "./chatShared";
import {
  assertParticipantAndFriends,
  loadConversationRow,
  loadMessageReactionMaps,
  toAttachment,
  toMessage,
} from "./chatShared";

export interface SendMessageInput {
  kind: ChatMessageKind;
  body?: string | null;
  stickerId?: string | null;
  uploadId?: string | null;
  durationMs?: number | null;
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

export async function sendMessage(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<ChatMessage> {
  const conv = await loadConversationRow(conversationId);
  if (!conv) {
    throw new DomainError(404, "Conversation not found");
  }
  await assertParticipantAndFriends(conv, userId);

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
