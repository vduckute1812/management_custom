/**
 * Post mutations: createPost, updatePost, deletePost.
 *
 * Read-side helpers (listFeedPosts, getPostById, assertPostVisible, cursors,
 * hydration) live in `./postQueries`.
 */
import { DomainError } from "~/server/utils/http";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import {
  assertOwnedUploads,
  purgeOrphanedUploads,
  type UploadRow,
} from "./uploads";
import type { PostFontFamily, PostTextColor } from "../../types/post";
import {
  PostFormat,
  PostVisibility,
  toPostFormat,
  toPostVisibility,
} from "../../types/post";
import { getCategoryById } from "./categories";
import { isContentLocale } from "../../utils/contentLocale";
import { clampVisibilityToCeiling } from "../../utils/postVisibilityRank";
import {
  getPostById,
  normalizeFontFamily,
  normalizeTitle,
  normalizeContentLocale,
  normalizeTextColor,
} from "./postQueries";

export {
  assertPostVisible,
  encodeFeedCursor,
  getPostById,
  listFeedPosts,
  parseFeedCursor,
} from "./postQueries";

async function insertAudienceRows(
  conn: PoolConnection,
  postId: string,
  userIds: string[],
  now: string,
): Promise<void> {
  if (!userIds.length) return;
  const values: unknown[] = [];
  const placeholders = userIds.map((uid) => {
    values.push(postId, uid, isoToDB(now));
    return "(?, ?, ?)";
  });
  await conn.query(
    `INSERT INTO post_audience (post_id, user_id, created_at) VALUES ${placeholders.join(",")}`,
    values,
  );
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
): Promise<import("../../types/post").Post> {
  const pool = getPool();
  const id = generateId("post");
  const now = nowISO();
  const trimmed = args.body.trim();
  const format = toPostFormat(args.format);
  const title = normalizeTitle(args.title);
  if (format === PostFormat.Manuscript && !title) {
    throw new DomainError(400, "Manuscript title is required");
  }
  let visibility = toPostVisibility(args.visibility);
  let audienceUserIds =
    visibility === PostVisibility.Shared
      ? [
          ...new Set(
            (args.audienceUserIds ?? []).filter((x) => x && x !== userId),
          ),
        ]
      : [];

  if (args.sharedPostId) {
    const existing = await getPostById(userId, args.sharedPostId);
    if (!existing) {
      throw new DomainError(404, "Shared post not found");
    }
    if (existing.visibility === PostVisibility.Private) {
      throw new DomainError(400, "Private posts cannot be shared");
    }
    // Never let a wrapper post widen access beyond the original.
    visibility = clampVisibilityToCeiling(visibility, existing.visibility);

    // Friends-only originals must not be re-shared to arbitrary audiences
    // (Shared visibility could name non-friends and widen access).
    if (
      existing.visibility === PostVisibility.Friends &&
      visibility === PostVisibility.Shared
    ) {
      visibility = PostVisibility.Friends;
    }

    if (visibility === PostVisibility.Shared) {
      const allowed = new Set(existing.audienceUserIds ?? []);
      allowed.add(existing.author.id);
      audienceUserIds = [
        ...new Set(
          (args.audienceUserIds ?? []).filter(
            (x) => x && x !== userId && allowed.has(x),
          ),
        ),
      ];
      if (
        existing.visibility === PostVisibility.Shared &&
        audienceUserIds.length === 0
      ) {
        throw new DomainError(
          400,
          "Share audience must be a subset of the original audience",
        );
      }
    } else {
      audienceUserIds = [];
    }
  }

  if (visibility === PostVisibility.Shared && audienceUserIds.length === 0) {
    throw new DomainError(
      400,
      "Shared posts require at least one audience member",
    );
  }

  let categoryId: string | null = args.categoryId?.trim() || null;
  if (categoryId) {
    const cat = await getCategoryById(categoryId);
    if (!cat) {
      throw new DomainError(400, "Invalid category");
    }
  }

  const fontFamily =
    format === PostFormat.Manuscript && !args.fontFamily
      ? ("serif" as PostFontFamily)
      : normalizeFontFamily(args.fontFamily);
  const textColor = normalizeTextColor(args.textColor);

  let contentLocale = "und";
  let translationGroupId: string | null = null;

  if (format === PostFormat.Manuscript) {
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
         WHERE translation_group_id = ? AND format = ${PostFormat.Manuscript}
         LIMIT 50`,
        [requestedGroup],
      );
      if (!groupRows.length) {
        throw new DomainError(404, "Translation group not found");
      }
      if (groupRows.some((r) => r.user_id !== userId)) {
        throw new DomainError(
          403,
          "You can only add translations to your own manuscripts",
        );
      }
      if (groupRows.some((r) => r.content_locale === contentLocale)) {
        throw new DomainError(
          409,
          "A translation already exists for this language",
        );
      }
      translationGroupId = requestedGroup;
    } else {
      translationGroupId = generateId("tgrp");
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
        format === PostFormat.Manuscript ? title : null,
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

    await insertAudienceRows(conn, id, audienceUserIds, now);

    for (const up of uploads) {
      await insertAttachment(conn, id, up, now);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    const code = (err as { code?: string })?.code;
    const sqlMessage = (err as { sqlMessage?: string })?.sqlMessage ?? "";
    if (
      code === "ER_DUP_ENTRY" &&
      sqlMessage.includes("uq_posts_group_locale")
    ) {
      throw new DomainError(
        409,
        "A translation already exists for this language",
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
): Promise<{
  post: import("../../types/post").Post;
  previousVisibility: PostVisibility;
}> {
  const pool = getPool();
  const [ownerRows] = await pool.query<
    (RowDataPacket & {
      user_id: string;
      format: PostFormat | null;
      visibility: PostVisibility;
    })[]
  >("SELECT user_id, format, visibility FROM posts WHERE id = ? LIMIT 1", [
    postId,
  ]);
  const owner = ownerRows[0];
  if (!owner || owner.user_id !== userId) {
    throw new DomainError(404, "Post not found");
  }

  const format = toPostFormat(owner.format);
  const trimmed = args.body.trim();
  if (!trimmed) {
    throw new DomainError(400, "Post body is required");
  }
  const title = normalizeTitle(args.title);
  if (format === PostFormat.Manuscript && !title) {
    throw new DomainError(400, "Manuscript title is required");
  }

  const visibility = toPostVisibility(args.visibility);
  const audienceUserIds =
    visibility === PostVisibility.Shared
      ? [
          ...new Set(
            (args.audienceUserIds ?? []).filter((x) => x && x !== userId),
          ),
        ]
      : [];

  if (visibility === PostVisibility.Shared && audienceUserIds.length === 0) {
    throw new DomainError(
      400,
      "Shared posts require at least one audience member",
    );
  }

  let categoryId: string | null = args.categoryId?.trim() || null;
  if (categoryId) {
    const cat = await getCategoryById(categoryId);
    if (!cat) {
      throw new DomainError(400, "Invalid category");
    }
  }

  const fontFamily =
    format === PostFormat.Manuscript && !args.fontFamily
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
        format === PostFormat.Manuscript ? title : null,
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
    await insertAudienceRows(conn, postId, audienceUserIds, now);

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
  return {
    post: updated,
    previousVisibility: toPostVisibility(owner.visibility),
  };
}

export async function deletePost(
  userId: string,
  postId: string,
): Promise<boolean> {
  const pool = getPool();
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

/** Admin hard-delete: remove a post by id regardless of author. */
export async function deletePostById(postId: string): Promise<boolean> {
  const pool = getPool();
  const [attRows] = await pool.query<(RowDataPacket & { upload_id: string })[]>(
    `SELECT upload_id FROM post_attachments WHERE post_id = ?`,
    [postId],
  );

  const [result] = await pool.query("DELETE FROM posts WHERE id = ?", [postId]);
  const ok = ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  if (ok && attRows.length) {
    await purgeOrphanedUploads(attRows.map((r) => r.upload_id));
  }
  return ok;
}
