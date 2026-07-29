import type { RowDataPacket } from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { avatarUrlFromUploadId } from "./mappers";
import { getPool } from "./pool";
import {
  assertOwnedUploads,
  purgeOrphanedUploads,
  type UploadRow,
} from "./uploads";
import type {
  Post,
  PostAttachment,
  PostAuthor,
  PostCategory,
  PostComment,
  PostFontFamily,
  PostFormat,
  PostReactionType,
  PostTextColor,
  PostTranslationRef,
  PostVisibility,
  SharedPostPreview,
} from "../../types/post";
import {
  POST_FONT_FAMILIES,
  POST_FORMATS,
  POST_REACTION_TYPES,
  POST_TEXT_COLORS,
} from "../../types/post";
import { getCategoryById } from "./categories";
import { CONTENT_LOCALES, isContentLocale } from "../../utils/contentLocale";

interface PostRow extends RowDataPacket {
  id: string;
  user_id: string;
  body: string;
  format: string | null;
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
  shared_format: string | null;
  shared_created_at: string | null;
  shared_author_id: string | null;
  shared_author_name: string | null;
  shared_author_email: string | null;
  shared_author_avatar_upload_id: string | null;
  shared_author_title: string | null;
  shared_author_job: string | null;
  shared_author_location: string | null;
}

interface CommentRow extends RowDataPacket {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_email: string;
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
  kind: "image" | "document";
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
  return {
    like: 0,
    love: 0,
    haha: 0,
    wow: 0,
    sad: 0,
    angry: 0,
  };
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
    name,
    email,
    avatarUrl: avatarUrlFromUploadId(extras?.avatarUploadId) ?? null,
    title: extras?.title ?? null,
    job: extras?.job ?? null,
    location: extras?.location ?? null,
  };
}

/** ACL for authenticated viewers (public + own + shared-with-me). */
function visibilityClause(alias = "p"): string {
  return `(
    ${alias}.visibility = 'public'
    OR ${alias}.user_id = ?
    OR (
      ${alias}.visibility = 'shared'
      AND EXISTS (
        SELECT 1 FROM post_audience a
        WHERE a.post_id = ${alias}.id AND a.user_id = ?
      )
    )
  )`;
}

/** Anonymous visitors may only see explicitly public posts. */
function publicOnlyClause(alias = "p"): string {
  return `${alias}.visibility = 'public'`;
}

const POST_SELECT = `
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

function normalizeFontFamily(value: string | null | undefined): PostFontFamily {
  if (value && (POST_FONT_FAMILIES as readonly string[]).includes(value)) {
    return value as PostFontFamily;
  }
  return "default";
}

function normalizeFormat(value: string | null | undefined): PostFormat {
  if (value && (POST_FORMATS as readonly string[]).includes(value)) {
    return value as PostFormat;
  }
  return "update";
}

function normalizeTitle(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

function normalizeContentLocale(value: string | null | undefined): string {
  if (isContentLocale(value)) return value;
  return "und";
}

function localeRank(locale: string, preferred: string | null): number {
  if (preferred && locale === preferred) return 0;
  if (locale === "en") return 1;
  if (locale === "vi") return 2;
  const idx = (CONTENT_LOCALES as readonly string[]).indexOf(locale);
  return idx >= 0 ? 10 + idx : 100;
}

function normalizeTextColor(value: string | null | undefined): PostTextColor {
  if (value && (POST_TEXT_COLORS as readonly string[]).includes(value)) {
    return value as PostTextColor;
  }
  return "default";
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
    const bucket = map.get(row.post_id) ?? emptyReactions();
    bucket[row.reaction] = Number(row.cnt);
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
      kind: row.kind,
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
      format: normalizeFormat(row.shared_format),
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
    (sum, key) => sum + (reactions[key] ?? 0),
    0,
  );
  const myReaction = row.my_reaction ?? null;

  return {
    id: row.id,
    format: normalizeFormat(row.format),
    title: normalizeTitle(row.title),
    body: row.body,
    visibility: row.visibility,
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
      // Standalone or single-locale group — keep in encounter order via sentinel.
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

  // Preserve original feed order using first occurrence of each key.
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

async function hydratePosts(
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
    where += " AND p.created_at < ?";
    params.push(isoToDB(cursor));
  }
  // Over-fetch slightly so locale dedupe still fills a page.
  params.push(limit * 2 + 1);

  const [rows] = await pool.query<PostRow[]>(
    `${POST_SELECT}
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ?`,
    params,
  );

  const hydrated = await hydratePosts(rows, vid, preferredLocale);
  const posts = hydrated.slice(0, limit);
  const nextCursor =
    hydrated.length > limit
      ? (posts[posts.length - 1]?.createdAt ?? null)
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

export async function createPost(
  userId: string,
  args: {
    body: string;
    title?: string | null;
    format?: PostFormat;
    visibility?: PostVisibility;
    audienceUserIds?: string[];
    attachmentIds?: string[];
    sharedPostId?: string | null;
    categoryId?: string | null;
    fontFamily?: PostFontFamily | null;
    textColor?: PostTextColor | null;
    contentLocale?: string | null;
    translationGroupId?: string | null;
  },
): Promise<Post> {
  const pool = getPool();
  const id = generateId("post");
  const now = nowISO();
  const trimmed = args.body.trim();
  const format = normalizeFormat(args.format);
  const title = normalizeTitle(args.title);
  if (format === "manuscript" && !title) {
    throw Object.assign(new Error("Manuscript title is required"), {
      statusCode: 400,
    });
  }
  const visibility: PostVisibility = args.visibility ?? "public";
  const audienceUserIds =
    visibility === "shared"
      ? [
          ...new Set(
            (args.audienceUserIds ?? []).filter((x) => x && x !== userId),
          ),
        ]
      : [];

  if (visibility === "shared" && audienceUserIds.length === 0) {
    throw Object.assign(
      new Error("Shared posts require at least one audience member"),
      { statusCode: 400 },
    );
  }

  let categoryId: string | null = args.categoryId?.trim() || null;
  if (categoryId) {
    const cat = await getCategoryById(categoryId);
    if (!cat) {
      throw Object.assign(new Error("Invalid category"), { statusCode: 400 });
    }
  }

  const fontFamily =
    format === "manuscript" && !args.fontFamily
      ? ("serif" as PostFontFamily)
      : normalizeFontFamily(args.fontFamily);
  const textColor = normalizeTextColor(args.textColor);

  let contentLocale = "und";
  let translationGroupId: string | null = null;

  if (format === "manuscript") {
    contentLocale = isContentLocale(args.contentLocale)
      ? args.contentLocale
      : "vi";
    const requestedGroup = args.translationGroupId?.trim() || null;
    if (requestedGroup) {
      const [groupRows] = await pool.query<
        (RowDataPacket & {
          id: string;
          user_id: string;
          content_locale: string;
        })[]
      >(
        `SELECT id, user_id, content_locale
         FROM posts
         WHERE translation_group_id = ? AND format = 'manuscript'
         LIMIT 50`,
        [requestedGroup],
      );
      if (!groupRows.length) {
        throw Object.assign(new Error("Translation group not found"), {
          statusCode: 404,
        });
      }
      if (groupRows.some((r) => r.user_id !== userId)) {
        throw Object.assign(
          new Error("You can only add translations to your own manuscripts"),
          { statusCode: 403 },
        );
      }
      if (groupRows.some((r) => r.content_locale === contentLocale)) {
        throw Object.assign(
          new Error("A translation already exists for this language"),
          { statusCode: 409 },
        );
      }
      translationGroupId = requestedGroup;
    } else {
      translationGroupId = generateId("tgrp");
    }
  }

  if (args.sharedPostId) {
    const existing = await getPostById(userId, args.sharedPostId);
    if (!existing) {
      throw Object.assign(new Error("Shared post not found"), {
        statusCode: 404,
      });
    }
  }

  const uploads = await assertOwnedUploads(userId, args.attachmentIds ?? []);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO posts
         (id, user_id, body, format, title, visibility, category_id, font_family, text_color,
          shared_post_id, translation_group_id, content_locale, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        trimmed,
        format,
        format === "manuscript" ? title : null,
        visibility,
        categoryId,
        fontFamily === "default" ? null : fontFamily,
        textColor === "default" ? null : textColor,
        args.sharedPostId ?? null,
        translationGroupId,
        contentLocale,
        isoToDB(now),
        isoToDB(now),
      ],
    );

    for (const uid of audienceUserIds) {
      await conn.query(
        `INSERT INTO post_audience (post_id, user_id, created_at) VALUES (?, ?, ?)`,
        [id, uid, isoToDB(now)],
      );
    }

    for (const up of uploads) {
      await insertAttachment(conn, id, up, now);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    const code = (err as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      throw Object.assign(
        new Error("A translation already exists for this language"),
        { statusCode: 409 },
      );
    }
    throw err;
  } finally {
    conn.release();
  }

  const created = await getPostById(userId, id);
  if (!created) {
    throw new Error("Failed to load created post");
  }
  return created;
}

async function insertAttachment(
  conn: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
  },
  postId: string,
  up: UploadRow,
  now: string,
) {
  const attId = generateId("att");
  await conn.query(
    `INSERT INTO post_attachments
       (id, post_id, upload_id, kind, file_name, mime, size_bytes, storage_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attId,
      postId,
      up.id,
      up.kind,
      up.file_name,
      up.mime,
      up.size_bytes,
      up.storage_key,
      isoToDB(now),
    ],
  );
}

export async function updatePost(
  userId: string,
  postId: string,
  args: {
    body: string;
    title?: string | null;
    visibility?: PostVisibility;
    audienceUserIds?: string[];
    attachmentIds?: string[];
    categoryId?: string | null;
    fontFamily?: PostFontFamily | null;
    textColor?: PostTextColor | null;
  },
): Promise<{ post: Post; previousVisibility: PostVisibility }> {
  const pool = getPool();
  const [ownerRows] = await pool.query<
    (RowDataPacket & {
      user_id: string;
      format: string | null;
      visibility: PostVisibility;
    })[]
  >("SELECT user_id, format, visibility FROM posts WHERE id = ? LIMIT 1", [
    postId,
  ]);
  const owner = ownerRows[0];
  if (!owner || owner.user_id !== userId) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }

  const format = normalizeFormat(owner.format);
  const trimmed = args.body.trim();
  if (!trimmed) {
    throw Object.assign(new Error("Post body is required"), {
      statusCode: 400,
    });
  }
  const title = normalizeTitle(args.title);
  if (format === "manuscript" && !title) {
    throw Object.assign(new Error("Manuscript title is required"), {
      statusCode: 400,
    });
  }

  const visibility: PostVisibility = args.visibility ?? "public";
  const audienceUserIds =
    visibility === "shared"
      ? [
          ...new Set(
            (args.audienceUserIds ?? []).filter((x) => x && x !== userId),
          ),
        ]
      : [];

  if (visibility === "shared" && audienceUserIds.length === 0) {
    throw Object.assign(
      new Error("Shared posts require at least one audience member"),
      { statusCode: 400 },
    );
  }

  let categoryId: string | null = args.categoryId?.trim() || null;
  if (categoryId) {
    const cat = await getCategoryById(categoryId);
    if (!cat) {
      throw Object.assign(new Error("Invalid category"), { statusCode: 400 });
    }
  }

  const fontFamily =
    format === "manuscript" && !args.fontFamily
      ? ("serif" as PostFontFamily)
      : normalizeFontFamily(args.fontFamily);
  const textColor = normalizeTextColor(args.textColor);
  const attachmentIds = [...new Set(args.attachmentIds ?? [])];
  const uploads = await assertOwnedUploads(userId, attachmentIds);
  const now = nowISO();

  const [existingAttRows] = await pool.query<
    (RowDataPacket & { id: string; upload_id: string })[]
  >(`SELECT id, upload_id FROM post_attachments WHERE post_id = ?`, [postId]);
  const existingByUpload = new Map(
    existingAttRows.map((r) => [r.upload_id, r.id]),
  );
  const nextUploadSet = new Set(attachmentIds);
  const removedUploadIds = existingAttRows
    .filter((r) => !nextUploadSet.has(r.upload_id))
    .map((r) => r.upload_id);
  const addedUploads = uploads.filter((u) => !existingByUpload.has(u.id));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE posts
       SET body = ?, title = ?, visibility = ?, category_id = ?,
           font_family = ?, text_color = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        trimmed,
        format === "manuscript" ? title : null,
        visibility,
        categoryId,
        fontFamily === "default" ? null : fontFamily,
        textColor === "default" ? null : textColor,
        isoToDB(now),
        postId,
        userId,
      ],
    );

    await conn.query(`DELETE FROM post_audience WHERE post_id = ?`, [postId]);
    for (const uid of audienceUserIds) {
      await conn.query(
        `INSERT INTO post_audience (post_id, user_id, created_at) VALUES (?, ?, ?)`,
        [postId, uid, isoToDB(now)],
      );
    }

    for (const uploadId of removedUploadIds) {
      await conn.query(
        `DELETE FROM post_attachments WHERE post_id = ? AND upload_id = ?`,
        [postId, uploadId],
      );
    }
    for (const up of addedUploads) {
      await insertAttachment(conn, postId, up, now);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  if (removedUploadIds.length) {
    await purgeOrphanedUploads(removedUploadIds);
  }

  const updated = await getPostById(userId, postId);
  if (!updated) {
    throw new Error("Failed to load updated post");
  }
  return { post: updated, previousVisibility: owner.visibility };
}

export async function deletePost(
  userId: string,
  postId: string,
): Promise<boolean> {
  const pool = getPool();
  // Capture attachment upload ids before CASCADE removes post_attachments.
  const [attRows] = await pool.query<(RowDataPacket & { upload_id: string })[]>(
    `SELECT pa.upload_id
     FROM post_attachments pa
     INNER JOIN posts p ON p.id = pa.post_id
     WHERE pa.post_id = ? AND p.user_id = ?`,
    [postId, userId],
  );

  const [result] = await pool.query(
    "DELETE FROM posts WHERE id = ? AND user_id = ?",
    [postId, userId],
  );
  const ok = ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  if (ok && attRows.length) {
    await purgeOrphanedUploads(attRows.map((r) => r.upload_id));
  }
  return ok;
}

export async function setPostReaction(
  userId: string,
  postId: string,
  reaction: PostReactionType,
): Promise<Post> {
  const pool = getPool();
  const post = await getPostById(userId, postId);
  if (!post) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }
  if (!POST_REACTION_TYPES.includes(reaction)) {
    throw Object.assign(new Error("Invalid reaction"), { statusCode: 400 });
  }

  await pool.query(
    `INSERT INTO post_reactions (post_id, user_id, reaction, created_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reaction = VALUES(reaction), created_at = VALUES(created_at)`,
    [postId, userId, reaction, isoToDB(nowISO())],
  );

  const refreshed = await getPostById(userId, postId);
  if (!refreshed) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }
  return refreshed;
}

export async function clearPostReaction(
  userId: string,
  postId: string,
): Promise<Post> {
  const pool = getPool();
  const post = await getPostById(userId, postId);
  if (!post) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }

  await pool.query(
    "DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?",
    [postId, userId],
  );

  const refreshed = await getPostById(userId, postId);
  if (!refreshed) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }
  return refreshed;
}

export async function listPostComments(
  viewerId: string | null,
  postId: string,
): Promise<PostComment[]> {
  const pool = getPool();
  const post = await getPostById(viewerId, postId);
  if (!post) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }

  const [rows] = await pool.query<CommentRow[]>(
    `SELECT
       c.id, c.post_id, c.user_id, c.body, c.created_at, c.updated_at,
       u.name AS author_name, u.email AS author_email
     FROM post_comments c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ?
     ORDER BY c.created_at ASC`,
    [postId],
  );
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    body: r.body,
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
    author: toAuthor(r.user_id, r.author_name, r.author_email),
    canDelete: !!viewerId && r.user_id === viewerId,
  }));
}

export async function createPostComment(
  userId: string,
  postId: string,
  body: string,
): Promise<PostComment> {
  const pool = getPool();
  const post = await getPostById(userId, postId);
  if (!post) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }

  const id = generateId("cmt");
  const now = nowISO();
  const trimmed = body.trim();
  await pool.query(
    `INSERT INTO post_comments (id, post_id, user_id, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, postId, userId, trimmed, isoToDB(now), isoToDB(now)],
  );
  await pool.query(
    `UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?`,
    [postId],
  );

  const comments = await listPostComments(userId, postId);
  const created = comments.find((c) => c.id === id);
  if (!created) {
    throw new Error("Failed to load created comment");
  }
  return created;
}

export async function deletePostComment(
  userId: string,
  postId: string,
  commentId: string,
): Promise<boolean> {
  const pool = getPool();
  const post = await getPostById(userId, postId);
  if (!post) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }
  const [result] = await pool.query(
    "DELETE FROM post_comments WHERE id = ? AND post_id = ? AND user_id = ?",
    [commentId, postId, userId],
  );
  const deleted =
    ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  if (deleted) {
    await pool.query(
      `UPDATE posts
       SET comment_count = GREATEST(CAST(comment_count AS SIGNED) - 1, 0)
       WHERE id = ?`,
      [postId],
    );
  }
  return deleted;
}

export async function searchUserDirectory(
  viewerId: string,
  q: string,
  limit = 20,
): Promise<PostAuthor[]> {
  const pool = getPool();
  const term = `%${q.trim().toLowerCase()}%`;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, email, avatar_upload_id FROM users
     WHERE id <> ?
       AND (
         LOWER(email) LIKE ?
         OR LOWER(COALESCE(name, '')) LIKE ?
       )
     ORDER BY name IS NULL, name ASC, email ASC
     LIMIT ?`,
    [viewerId, term, term, Math.min(Math.max(limit, 1), 20)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: (r.name as string | null) ?? null,
    email: String(r.email),
    avatarUrl:
      avatarUrlFromUploadId((r.avatar_upload_id as string | null) ?? null) ??
      null,
  }));
}

/** Resolve directory-style author cards for a set of user ids (edit forms). */
export async function getAuthorsByIds(
  userIds: string[],
): Promise<PostAuthor[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return [];
  const pool = getPool();
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, email, avatar_upload_id, title, job, location
     FROM users
     WHERE id IN (${placeholders})`,
    unique,
  );
  const byId = new Map(
    rows.map((r) => [
      String(r.id),
      toAuthor(
        String(r.id),
        (r.name as string | null) ?? null,
        String(r.email),
        {
          avatarUploadId: (r.avatar_upload_id as string | null) ?? null,
          title: (r.title as string | null) ?? null,
          job: (r.job as string | null) ?? null,
          location: (r.location as string | null) ?? null,
        },
      ),
    ]),
  );
  return unique
    .map((id) => byId.get(id))
    .filter((a): a is PostAuthor => Boolean(a));
}
