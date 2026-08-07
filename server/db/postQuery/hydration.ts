import type { RowDataPacket } from "mysql2/promise";
import { dbToISO } from "../datetime";
import { avatarUrlFromUploadId } from "../mappers";
import { getPool } from "../pool";
import { resolveDisplayName } from "../../../utils/displayName";
import type {
  Post,
  PostAttachment,
  PostAuthor,
  PostCategory,
  PostReactionType,
  PostTranslationRef,
  SharedPostPreview,
} from "../../../types/post";
import {
  POST_REACTION_TYPES,
  UploadKind,
  toPostFormat,
  toPostVisibility,
  toUploadKind,
} from "../../../types/post";
import {
  emptyReactions as emptyReactionCounts,
  toReactionType,
} from "../../../types/reaction";
import { CONTENT_LOCALES } from "../../../utils/contentLocale";
import {
  normalizeContentLocale,
  normalizeFontFamily,
  normalizeTextColor,
  normalizeTitle,
} from "./normalizers";
import type { PostRow } from "./types";

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

function toAuthor(
  id: string,
  name: string | null,
  email: string,
  extras?: {
    avatarUploadId?: string | null;
    title?: string | null;
    job?: string | null;
    location?: string | null;
  },
): PostAuthor {
  return {
    id,
    name: resolveDisplayName(name, email),
    email,
    avatarUrl: avatarUrlFromUploadId(extras?.avatarUploadId) ?? null,
    title: extras?.title ?? null,
    job: extras?.job ?? null,
    location: extras?.location ?? null,
  };
}

function localeRank(locale: string, preferred: string | null): number {
  if (preferred && locale === preferred) return 0;
  if (locale === "en") return 1;
  if (locale === "vi") return 2;
  const idx = (CONTENT_LOCALES as readonly string[]).indexOf(locale);
  return idx >= 0 ? 10 + idx : 100;
}

/**
 * Translation groups produce at least one hydrated card each. Treating every
 * non-null group as one candidate is a safe lower bound: malformed singleton
 * groups may make us over-fetch, but can never make us stop too early.
 */
export function shouldFetchMoreLocaleRows(
  rows: readonly Pick<PostRow, "id" | "translation_group_id">[],
  targetCount: number,
  lastBatchFull: boolean,
): boolean {
  if (!lastBatchFull) return false;
  const candidates = new Set(
    rows.map((row) =>
      row.translation_group_id
        ? `group:${row.translation_group_id}`
        : `post:${row.id}`,
    ),
  );
  return candidates.size < targetCount;
}

function categoryFromRow(row: PostRow): PostCategory | null {
  if (!row.category_id || !row.category_slug || !row.category_name) return null;
  return {
    id: row.category_id,
    slug: row.category_slug,
    name: row.category_name,
    sortOrder: Number(row.category_sort_order ?? 0),
  };
}

async function loadReactionMaps(
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

async function loadMyReactions(
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

async function loadAttachments(
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

async function loadAudience(postIds: string[]): Promise<Map<string, string[]>> {
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

function rowToPost(
  row: PostRow,
  viewerId: string,
  reactions: Record<PostReactionType, number>,
  attachments: PostAttachment[],
  audienceUserIds: string[],
  myReaction: PostReactionType | null,
): Post {
  let sharedPost: SharedPostPreview | null = null;
  if (
    row.shared_post_id &&
    row.shared_body != null &&
    row.shared_author_id &&
    row.shared_author_email
  ) {
    sharedPost = {
      id: row.shared_post_id,
      title: normalizeTitle(row.shared_title),
      body: row.shared_body,
      format: toPostFormat(row.shared_format),
      createdAt: dbToISO(row.shared_created_at),
      author: toAuthor(
        row.shared_author_id,
        row.shared_author_name,
        row.shared_author_email,
        {
          avatarUploadId: row.shared_author_avatar_upload_id,
          title: row.shared_author_title,
          job: row.shared_author_job,
          location: row.shared_author_location,
        },
      ),
    };
  }

  const reactionCount = POST_REACTION_TYPES.reduce(
    (sum: number, key) => sum + (reactions[key] ?? 0),
    0,
  );

  const author = toAuthor(row.user_id, row.author_name, row.author_email, {
    avatarUploadId: row.author_avatar_upload_id,
    title: row.author_title,
    job: row.author_job,
    location: row.author_location,
  });
  // Only the post owner sees their own email on the wire.
  if (!viewerId || row.user_id !== viewerId) {
    author.email = "";
  }

  if (sharedPost && (!viewerId || row.shared_author_id !== viewerId)) {
    sharedPost.author.email = "";
  }

  return {
    id: row.id,
    format: toPostFormat(row.format),
    title: normalizeTitle(row.title),
    body: row.body,
    visibility: toPostVisibility(row.visibility),
    category: categoryFromRow(row),
    fontFamily: normalizeFontFamily(row.font_family),
    textColor: normalizeTextColor(row.text_color),
    contentLocale: normalizeContentLocale(row.content_locale),
    translationGroupId: row.translation_group_id ?? null,
    translations: [],
    createdAt: dbToISO(row.created_at),
    updatedAt: dbToISO(row.updated_at),
    author,
    reactions,
    reactionCount,
    myReaction,
    commentCount: Number(row.comment_count ?? 0),
    attachments,
    audienceUserIds,
    sharedPost,
    canEdit: !!viewerId && row.user_id === viewerId,
    canDelete: !!viewerId && row.user_id === viewerId,
  };
}

async function loadTranslationMaps(
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

function preferLocaleVariants(
  posts: Post[],
  preferredLocale: string | null,
  translationMap: Map<string, PostTranslationRef[]>,
): Post[] {
  const bestByGroup = new Map<string, Post>();

  for (const post of posts) {
    const groupId = post.translationGroupId;
    const siblings = groupId ? (translationMap.get(groupId) ?? []) : [];
    const withTranslations: Post = {
      ...post,
      translations: siblings,
    };

    if (!groupId || siblings.length <= 1) {
      bestByGroup.set(`solo:${post.id}`, withTranslations);
      continue;
    }

    const prev = bestByGroup.get(groupId);
    if (
      !prev ||
      localeRank(withTranslations.contentLocale, preferredLocale) <
        localeRank(prev.contentLocale, preferredLocale)
    ) {
      bestByGroup.set(groupId, withTranslations);
    }
  }

  const emitted = new Set<string>();
  const out: Post[] = [];
  for (const post of posts) {
    const key =
      post.translationGroupId &&
      (translationMap.get(post.translationGroupId)?.length ?? 0) > 1
        ? post.translationGroupId
        : `solo:${post.id}`;
    if (emitted.has(key)) continue;
    const chosen = bestByGroup.get(key);
    if (!chosen) continue;
    emitted.add(key);
    out.push(chosen);
  }
  return out;
}

export async function hydratePosts(
  rows: PostRow[],
  viewerId: string,
  preferredLocale: string | null = null,
): Promise<Post[]> {
  const ids = rows.map((r) => r.id);
  const groupIds = rows
    .map((r) => r.translation_group_id)
    .filter((id): id is string => Boolean(id));
  const [reactions, myReactions, attachments, audience, translations] =
    await Promise.all([
      loadReactionMaps(ids),
      loadMyReactions(ids, viewerId),
      loadAttachments(ids),
      loadAudience(ids),
      loadTranslationMaps(groupIds),
    ]);
  const posts = rows.map((r) =>
    rowToPost(
      r,
      viewerId,
      reactions.get(r.id) ?? emptyReactions(),
      attachments.get(r.id) ?? [],
      audience.get(r.id) ?? [],
      myReactions.get(r.id) ?? null,
    ),
  );
  return preferLocaleVariants(posts, preferredLocale, translations);
}
