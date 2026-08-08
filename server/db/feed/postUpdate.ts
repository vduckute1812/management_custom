/**
 * Update an owned feed post.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "../core/datetime";
import { nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { assertOwnedUploads, purgeOrphanedUploads } from "./uploads";
import type { PostFontFamily, PostTextColor } from "~/types/post";
import {
  PostFormat,
  PostVisibility,
  toPostFormat,
  toPostVisibility,
} from "~/types/post";
import { getCategoryById } from "./categories";
import { constrainShareWrapperAccess } from "../../utils/shareVisibility";
import {
  getPostById,
  normalizeFontFamily,
  normalizeTitle,
  normalizeTextColor,
} from "./postQueries";
import { insertAttachment, insertAudienceRows } from "./postWriteShared";

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
  post: import("../../../types/post").Post;
  previousVisibility: PostVisibility;
}> {
  const pool = getPool();
  const [ownerRows] = await pool.query<
    (RowDataPacket & {
      user_id: string;
      format: PostFormat | null;
      visibility: PostVisibility;
      shared_post_id: string | null;
    })[]
  >(
    "SELECT user_id, format, visibility, shared_post_id FROM posts WHERE id = ? LIMIT 1",
    [postId],
  );
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

  let visibility = toPostVisibility(args.visibility);
  let audienceUserIds =
    visibility === PostVisibility.Shared
      ? [
          ...new Set(
            (args.audienceUserIds ?? []).filter((x) => x && x !== userId),
          ),
        ]
      : [];

  // Share wrappers must stay within the original post's access ceiling on
  // update as well as create — otherwise PATCH can undo the write clamp.
  if (owner.shared_post_id) {
    const original = await getPostById(userId, owner.shared_post_id);
    if (!original) {
      throw new DomainError(404, "Shared post not found");
    }
    const constrained = constrainShareWrapperAccess({
      originalVisibility: original.visibility,
      originalAudienceIds: original.audienceUserIds ?? [],
      originalAuthorId: original.author.id,
      sharerUserId: userId,
      requestedVisibility: visibility,
      requestedAudienceIds: args.audienceUserIds ?? [],
    });
    visibility = constrained.visibility;
    audienceUserIds = constrained.audienceUserIds;
  }

  if (visibility === PostVisibility.Shared && audienceUserIds.length === 0) {
    throw new DomainError(
      400,
      "Shared posts require at least one audience member",
    );
  }

  const categoryId: string | null = args.categoryId?.trim() || null;
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
