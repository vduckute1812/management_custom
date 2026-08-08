/**
 * Chat message send (text / sticker / photo / voice).
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
import { generateId, nowISO } from "../core/ids";
import { isoToDB } from "../core/datetime";
import { getPool } from "../core/pool";
import { getUploadById } from "../feed/uploads";
import {
  assertParticipantAndFriends,
  loadConversationRow,
  toAttachment,
} from "./chatShared";

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
