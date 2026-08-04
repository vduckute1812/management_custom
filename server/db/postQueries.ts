/**
 * Read-side helpers for the posts feed.
 *
 * Contains all query/hydration logic (SELECT, pagination cursors, loaders).
 * Mutations (createPost, updatePost, deletePost) live in `./posts`.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { avatarUrlFromUploadId } from "./mappers";
import { getPool } from "./pool";
import { resolveDisplayName } from "../../utils/displayName";
import type {
  Post,
  PostAttachment,
  PostAuthor,
  PostCategory,
  PostFontFamily,
  PostReactionType,
  PostTextColor,
  PostTranslationRef,
  SharedPostPreview,
} from "../../types/post";
import {
  POST_FONT_FAMILIES,
  POST_REACTION_TYPES,
  POST_TEXT_COLORS,
  PostFormat,
  PostVisibility,
  UploadKind,
  toPostFormat,
  toPostVisibility,
  toUploadKind,
} from "../../types/post";
import {
  emptyReactions as emptyReactionCounts,
  toReactionType,
} from "../../types/reaction";
import { CONTENT_LOCALES, isContentLocale } from "../../utils/contentLocale";

// ---------------------------------------------------------------------------
// Row interfaces
// ---------------------------------------------------------------------------

export interface PostRow extends RowDataPacket {
  id: string;
  user_id: string;
  body: string;
  format: PostFormat | null;
  title: string | null;
  visibility: PostVisibility;
  category_id: string | null;
  font_family: string | null;
  text_color: string | null;
  shared_post_id: string | null;
  translation_group_id: string | null;
  content_locale: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_email: string;
  author_avatar_upload_id: string | null;
  author_title: string | null;
  author_job: string | null;
  author_location: string | null;
  comment_count: number;
  my_reaction: PostReactionType | null;
  category_slug: string | null;
  category_name: string | null;
  category_sort_order: number | null;
  shared_body: string | null;
  shared_title: string | null;
  shared_format: PostFormat | null;
  shared_created_at: string | null;
  shared_author_id: string | null;
  shared_author_name: string | null;
  shared_author_email: string | null;
  shared_author_avatar_upload_id: string | null;
  shared_author_title: string | null;
  shared_author_job: string | null;
  shared_author_location: string | null;
}

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

// ---------------------------------------------------------------------------
// Shared normalizer helpers (also used by the mutation module)
// ---------------------------------------------------------------------------

export function normalizeFontFamily(
  value: string | null | undefined,
): PostFontFamily {
  if (value && (POST_FONT_FAMILIES as readonly string[]).includes(value)) {
    return value as PostFontFamily;
  }
  return "default";
}

export function normalizeTitle(
  value: string | null | undefined,
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

export function normalizeContentLocale(
  value: string | null | undefined,
): string {
  if (isContentLocale(value)) return value;
  return "und";
}

export function normalizeTextColor(
  value: string | null | undefined,
): PostTextColor {
  if (value && (POST_TEXT_COLORS as readonly string[]).includes(value)) {
    return value as PostTextColor;
  }
  return "default";
}

// ---------------------------------------------------------------------------
// ACL helpers
// ---------------------------------------------------------------------------

/** ACL for authenticated viewers (public + own + shared-with-me). */
export function visibilityClause(alias = "p"): string {
  return `(
    ${alias}.visibility = ${PostVisibility.Public}
    OR ${alias}.user_id = ?
    OR (
      ${alias}.visibility = ${PostVisibility.Shared}
      AND EXISTS (
        SELECT 1 FROM post_audience a
        WHERE a.post_id = ${alias}.id AND a.user_id = ?
      )
    )
  )`;
}

/** Anonymous visitors may only see explicitly public posts. */
export function publicOnlyClause(alias = "p"): string {
  return `${alias}.visibility = ${PostVisibility.Public}`;
}

// ---------------------------------------------------------------------------
// Feed cursor
// ---------------------------------------------------------------------------

/**
 * Feed page token: `createdAt|id` (stable under equal timestamps).
 * Legacy clients may still send a bare ISO `createdAt`.
 */
export function encodeFeedCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function parseFeedCursor(cursor: string): {
  createdAt: string;
  id: string | null;
} {
  const trimmed = cursor.trim();
  const sep = trimmed.lastIndexOf("|");
  if (sep > 0) {
    const createdAt = trimmed.slice(0, sep);
    const id = trimmed.slice(sep + 1);
    if (createdAt && id) return { createdAt, id };
  }
  return { createdAt: trimmed, id: null };
}

// ---------------------------------------------------------------------------
// SELECT fragment + private helpers
// ---------------------------------------------------------------------------

export const POST_SELECT = `
  SELECT
    p.id,
    p.user_id,
    p.body,
    p.format,
    p.title,
    p.visibility,
    p.category_id,
    p.font_family,
    p.text_color,
    p.shared_post_id,
    p.translation_group_id,
    p.content_locale,
    p.created_at,
    p.updated_at,
    u.name AS author_name,
    u.email AS author_email,
    u.avatar_upload_id AS author_avatar_upload_id,
    u.title AS author_title,
    u.job AS author_job,
    u.location AS author_location,
    p.comment_count AS comment_count,
    (SELECT pr.reaction FROM post_reactions pr
      WHERE pr.post_id = p.id AND pr.user_id = ? LIMIT 1) AS my_reaction,
    c.slug AS category_slug,
    c.name AS category_name,
    c.sort_order AS category_sort_order,
    sp.body AS shared_body,
    sp.title AS shared_title,
    sp.format AS shared_format,
    sp.created_at AS shared_created_at,
    su.id AS shared_author_id,
    su.name AS shared_author_name,
    su.email AS shared_author_email,
    su.avatar_upload_id AS shared_author_avatar_upload_id,
    su.title AS shared_author_title,
    su.job AS shared_author_job,
    su.location AS shared_author_location
  FROM posts p
  INNER JOIN users u ON u.id = p.user_id
  LEFT JOIN post_categories c ON c.id = p.category_id
  LEFT JOIN posts sp ON sp.id = p.shared_post_id
  LEFT JOIN users su ON su.id = sp.user_id
`;

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
  const myReaction = toReactionType(row.my_reaction);

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
    author: toAuthor(row.user_id, row.author_name, row.author_email, {
      avatarUploadId: row.author_avatar_upload_id,
      title: row.author_title,
      job: row.author_job,
      location: row.author_location,
    }),
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

/**
 * Prefer viewer locale within a translation group; drop sibling duplicates
 * from the current page.
 */
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
  const [reactions, attachments, audience, translations] = await Promise.all([
    loadReactionMaps(ids),
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
    ),
  );
  return preferLocaleVariants(posts, preferredLocale, translations);
}

// ---------------------------------------------------------------------------
// Public query API
// ---------------------------------------------------------------------------

/** Cheap ACL check — does not hydrate attachments/reactions/audience. */
export async function assertPostVisible(
  viewerId: string,
  postId: string,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM posts p
     WHERE p.id = ? AND ${visibilityClause("p")}
     LIMIT 1`,
    [postId, viewerId, viewerId],
  );
  if (!rows.length) {
    throw new DomainError(404, "Post not found");
  }
}

export async function listFeedPosts(
  viewerId: string | null,
  options: {
    cursor?: string | null;
    limit?: number;
    categoryId?: string | null;
    locale?: string | null;
  } = {},
): Promise<{ posts: Post[]; nextCursor: string | null }> {
  const pool = getPool();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const cursor = options.cursor?.trim() || null;
  const categoryId = options.categoryId?.trim() || null;
  const preferredLocale = isContentLocale(options.locale)
    ? options.locale
    : null;
  const vid = viewerId ?? "";

  // POST_SELECT binds viewer id for my_reaction first.
  const params: unknown[] = [vid];
  let where: string;
  if (viewerId) {
    where = `WHERE ${visibilityClause("p")}`;
    params.push(viewerId, viewerId);
  } else {
    where = `WHERE ${publicOnlyClause("p")}`;
  }
  if (categoryId) {
    where += " AND p.category_id = ?";
    params.push(categoryId);
  }
  if (cursor) {
    const parsed = parseFeedCursor(cursor);
    if (parsed.id) {
      // Tie-break on id so posts sharing created_at are not skipped/duplicated.
      where += " AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))";
      const at = isoToDB(parsed.createdAt);
      params.push(at, at, parsed.id);
    } else {
      where += " AND p.created_at < ?";
      params.push(isoToDB(parsed.createdAt));
    }
  }
  // Over-fetch slightly so locale dedupe still fills a page.
  params.push(limit * 2 + 1);

  const [rows] = await pool.query<PostRow[]>(
    `${POST_SELECT}
     ${where}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ?`,
    params,
  );

  const hydrated = await hydratePosts(rows, vid, preferredLocale);
  const posts = hydrated.slice(0, limit);
  const last = posts[posts.length - 1];
  const nextCursor =
    hydrated.length > limit && last
      ? encodeFeedCursor(last.createdAt, last.id)
      : null;
  return { posts, nextCursor };
}

export async function getPostById(
  viewerId: string | null,
  postId: string,
): Promise<Post | null> {
  const pool = getPool();
  const vid = viewerId ?? "";
  const params: unknown[] = [vid, postId];
  const acl = viewerId ? visibilityClause("p") : publicOnlyClause("p");
  if (viewerId) {
    params.push(viewerId, viewerId);
  }

  const [rows] = await pool.query<PostRow[]>(
    `${POST_SELECT}
     WHERE p.id = ? AND ${acl}
     LIMIT 1`,
    params,
  );
  if (!rows.length) return null;
  const [post] = await hydratePosts(rows, vid, null);
  return post ?? null;
}
