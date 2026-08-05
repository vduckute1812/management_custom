/**
 * Shared row interfaces, mappers, and helpers for the chat sub-modules.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import {
  ChatMessageKind,
  CHAT_REACTION_TYPES,
  emptyChatReactions,
  type ChatAttachment,
  type ChatMessage,
  type ChatMessageReactionType,
  type ChatPeer,
} from "~/types/chat";
import { UploadKind, toUploadKind } from "~/types/post";
import { toReactionType } from "~/types/reaction";
import { resolveDisplayName } from "../../utils/displayName";
import { dbToISO } from "./datetime";
import { avatarUrlFromUploadId } from "./mappers";
import { getPool } from "./pool";

export interface ReactionCountRow extends RowDataPacket {
  message_id: string;
  reaction: ChatMessageReactionType;
  cnt: number;
}

export interface MyReactionRow extends RowDataPacket {
  message_id: string;
  reaction: ChatMessageReactionType;
}

export interface ConversationRow extends RowDataPacket {
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

export interface MessageRow extends RowDataPacket {
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

export function toKind(n: unknown): ChatMessageKind {
  const v = Number(n);
  if (v === ChatMessageKind.Emoji) return ChatMessageKind.Emoji;
  if (v === ChatMessageKind.Sticker) return ChatMessageKind.Sticker;
  if (v === ChatMessageKind.Image) return ChatMessageKind.Image;
  if (v === ChatMessageKind.Audio) return ChatMessageKind.Audio;
  return ChatMessageKind.Text;
}

export function toAttachment(args: {
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

export function toPeer(row: {
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

export function toMessage(
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

export async function loadMessageReactionMaps(
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

export function orderedPair(userId: string, peerId: string): [string, string] {
  return userId < peerId ? [userId, peerId] : [peerId, userId];
}

export function assertParticipant(
  row: { user_a_id: string; user_b_id: string },
  userId: string,
): void {
  if (row.user_a_id !== userId && row.user_b_id !== userId) {
    throw new DomainError(404, "Conversation not found");
  }
}

/** Participant check + Accepted friendship (blocks post-unfriend DM use). */
export async function assertParticipantAndFriends(
  row: { user_a_id: string; user_b_id: string },
  userId: string,
): Promise<void> {
  assertParticipant(row, userId);
  const peerId = row.user_a_id === userId ? row.user_b_id : row.user_a_id;
  const { areFriends } = await import("./friendships");
  if (!(await areFriends(userId, peerId))) {
    throw new DomainError(403, "Friends only");
  }
}

export async function loadConversationRow(
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
