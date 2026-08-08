/**
 * Batch loaders used by post hydration (reactions, attachments, audience, translations).
 */
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../../core/pool";
import type {
  PostAttachment,
  PostReactionType,
  PostTranslationRef,
  UploadKind,
} from "~/types/post";
import { toUploadKind } from "~/types/post";
import {
  emptyReactions as emptyReactionCounts,
  toReactionType,
} from "~/types/reaction";
import { normalizeContentLocale, normalizeTitle } from "./normalizers";

interface ReactionCountRow extends RowDataPacket {
  post_id: string;
  reaction: PostReactionType;
  cnt: number;
}

interface AttachmentRow extends RowDataPacket {
  id: string;
  post_id: string;
  upload_id: string;
  kind: UploadKind;
  file_name: string;
  mime: string;
  size_bytes: number;
  storage_key: string;
}

interface AudienceRow extends RowDataPacket {
  post_id: string;
  user_id: string;
}

function emptyReactions(): Record<PostReactionType, number> {
  return emptyReactionCounts();
}

export async function loadReactionMaps(
  postIds: string[],
): Promise<Map<string, Record<PostReactionType, number>>> {
  const map = new Map<string, Record<PostReactionType, number>>();
  for (const id of postIds) map.set(id, emptyReactions());
  if (!postIds.length) return map;

  const pool = getPool();
  const placeholders = postIds.map(() => "?").join(",");
  const [rows] = await pool.query<ReactionCountRow[]>(
    `SELECT post_id, reaction, COUNT(*) AS cnt
     FROM post_reactions
     WHERE post_id IN (${placeholders})
     GROUP BY post_id, reaction`,
    postIds,
  );
  for (const row of rows) {
    const reaction = toReactionType(row.reaction);
    if (reaction == null) continue;
    const bucket = map.get(row.post_id) ?? emptyReactions();
    bucket[reaction] = Number(row.cnt);
    map.set(row.post_id, bucket);
  }
  return map;
}

export async function loadMyReactions(
  postIds: string[],
  viewerId: string,
): Promise<Map<string, PostReactionType | null>> {
  const map = new Map<string, PostReactionType | null>();
  for (const id of postIds) map.set(id, null);
  if (!postIds.length || !viewerId) return map;

  const pool = getPool();
  const placeholders = postIds.map(() => "?").join(",");
  const [rows] = await pool.query<
    (RowDataPacket & { post_id: string; reaction: number })[]
  >(
    `SELECT post_id, reaction
     FROM post_reactions
     WHERE user_id = ? AND post_id IN (${placeholders})`,
    [viewerId, ...postIds],
  );
  for (const row of rows) {
    map.set(row.post_id, toReactionType(row.reaction));
  }
  return map;
}

export async function loadAttachments(
  postIds: string[],
): Promise<Map<string, PostAttachment[]>> {
  const map = new Map<string, PostAttachment[]>();
  for (const id of postIds) map.set(id, []);
  if (!postIds.length) return map;

  const pool = getPool();
  const placeholders = postIds.map(() => "?").join(",");
  const [rows] = await pool.query<AttachmentRow[]>(
    `SELECT id, post_id, upload_id, kind, file_name, mime, size_bytes, storage_key
     FROM post_attachments
     WHERE post_id IN (${placeholders})
     ORDER BY created_at ASC`,
    postIds,
  );
  for (const row of rows) {
    const list = map.get(row.post_id) ?? [];
    list.push({
      id: row.id,
      uploadId: row.upload_id,
      kind: toUploadKind(row.kind),
      fileName: row.file_name,
      mime: row.mime,
      sizeBytes: Number(row.size_bytes),
      url: `/api/uploads/${row.upload_id}`,
    });
    map.set(row.post_id, list);
  }
  return map;
}

export async function loadAudience(
  postIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const id of postIds) map.set(id, []);
  if (!postIds.length) return map;

  const pool = getPool();
  const placeholders = postIds.map(() => "?").join(",");
  const [rows] = await pool.query<AudienceRow[]>(
    `SELECT post_id, user_id FROM post_audience WHERE post_id IN (${placeholders})`,
    postIds,
  );
  for (const row of rows) {
    const list = map.get(row.post_id) ?? [];
    list.push(row.user_id);
    map.set(row.post_id, list);
  }
  return map;
}

export async function loadTranslationMaps(
  groupIds: string[],
): Promise<Map<string, PostTranslationRef[]>> {
  const map = new Map<string, PostTranslationRef[]>();
  const unique = [...new Set(groupIds.filter(Boolean))];
  if (!unique.length) return map;

  const pool = getPool();
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await pool.query<
    (RowDataPacket & {
      id: string;
      translation_group_id: string;
      content_locale: string;
      title: string | null;
    })[]
  >(
    `SELECT id, translation_group_id, content_locale, title
     FROM posts
     WHERE translation_group_id IN (${placeholders})
     ORDER BY created_at ASC`,
    unique,
  );

  for (const row of rows) {
    const locale = normalizeContentLocale(row.content_locale);
    if (locale === "und") continue;
    const list = map.get(row.translation_group_id) ?? [];
    list.push({
      id: row.id,
      locale,
      title: normalizeTitle(row.title),
    });
    map.set(row.translation_group_id, list);
  }
  return map;
}
