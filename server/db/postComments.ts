import { DomainError } from "~/server/utils/http";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { PostComment } from "../../types/post";
import { resolveDisplayName } from "../../utils/displayName";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import { getPostById } from "./posts";

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

export type PostCommentsPage = {
  comments: PostComment[];
  /** True when older comments exist before the first item in `comments`. */
  hasMore: boolean;
  /** Pass as `before` to load the next older page. */
  nextBefore: string | null;
};

function mapCommentRow(r: CommentRow, viewerId: string | null): PostComment {
  return {
    id: r.id,
    postId: r.post_id,
    body: r.body,
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
    author: {
      id: r.user_id,
      name: resolveDisplayName(r.author_name, r.author_email),
      email: r.author_email,
      avatarUrl: null,
      title: null,
      job: null,
      location: null,
    },
    canDelete: !!viewerId && r.user_id === viewerId,
  };
}

/**
 * List comments newest-page-first. Returns chronological ASC for display.
 * Pass `before` (ISO createdAt of the oldest loaded comment) to page older.
 */
export async function listPostComments(
  viewerId: string | null,
  postId: string,
  opts: { limit?: number; before?: string | null } = {},
): Promise<PostCommentsPage> {
  const pool = getPool();
  const post = await getPostById(viewerId, postId);
  if (!post) {
    throw new DomainError(404, "Post not found");
  }

  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50);
  const before = opts.before?.trim() || null;
  const params: unknown[] = [postId];
  let beforeClause = "";
  if (before) {
    beforeClause = "AND c.created_at < ?";
    params.push(isoToDB(before));
  }
  // Fetch newest-of-page first (DESC), then reverse to ASC for the UI.
  params.push(limit + 1);
  const [rows] = await pool.query<CommentRow[]>(
    `SELECT
       c.id, c.post_id, c.user_id, c.body, c.created_at, c.updated_at,
       u.name AS author_name, u.email AS author_email
     FROM post_comments c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ?
       ${beforeClause}
     ORDER BY c.created_at DESC
     LIMIT ?`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  page.reverse();
  const comments = page.map((r) => mapCommentRow(r, viewerId));
  return {
    comments,
    hasMore,
    nextBefore: comments[0]?.createdAt ?? null,
  };
}

export async function createPostComment(
  userId: string,
  postId: string,
  body: string,
): Promise<PostComment> {
  const pool = getPool();
  const post = await getPostById(userId, postId);
  if (!post) {
    throw new DomainError(404, "Post not found");
  }

  const id = generateId("cmt");
  const now = nowISO();
  const trimmed = body.trim();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO post_comments (id, post_id, user_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, postId, userId, trimmed, isoToDB(now), isoToDB(now)],
    );
    await conn.query(
      `UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?`,
      [postId],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [rows] = await pool.query<CommentRow[]>(
    `SELECT
       c.id, c.post_id, c.user_id, c.body, c.created_at, c.updated_at,
       u.name AS author_name, u.email AS author_email
     FROM post_comments c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to load created comment");
  }
  return mapCommentRow(row, userId);
}

export async function deletePostComment(
  userId: string,
  postId: string,
  commentId: string,
): Promise<boolean> {
  const pool = getPool();
  const post = await getPostById(userId, postId);
  if (!post) {
    throw new DomainError(404, "Post not found");
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query<ResultSetHeader>(
      "DELETE FROM post_comments WHERE id = ? AND post_id = ? AND user_id = ?",
      [commentId, postId, userId],
    );
    const deleted = (result.affectedRows ?? 0) > 0;
    if (deleted) {
      await conn.query(
        `UPDATE posts
         SET comment_count = GREATEST(CAST(comment_count AS SIGNED) - 1, 0)
         WHERE id = ?`,
        [postId],
      );
    }
    await conn.commit();
    return deleted;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Recompute `posts.comment_count` from `post_comments`.
 * Pass `postIds` to force a rewrite for those posts (e.g. after a user
 * delete cascades comments). Omit to fix only **drifted** rows — a JOIN
 * against the live COUNT so unchanged posts are not rewritten.
 */
export async function recountCommentCounts(
  postIds?: string[],
): Promise<number> {
  const pool = getPool();
  if (postIds && postIds.length === 0) return 0;

  if (postIds) {
    const placeholders = postIds.map(() => "?").join(",");
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE posts p
       LEFT JOIN (
         SELECT post_id, COUNT(*) AS cnt
           FROM post_comments
          WHERE post_id IN (${placeholders})
          GROUP BY post_id
       ) x ON x.post_id = p.id
       SET p.comment_count = COALESCE(x.cnt, 0)
       WHERE p.id IN (${placeholders})`,
      [...postIds, ...postIds],
    );
    return result.affectedRows ?? 0;
  }

  // Safety-net path (job worker): only touch rows whose denormalized
  // counter disagrees with the live COUNT.
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE posts p
     LEFT JOIN (
       SELECT post_id, COUNT(*) AS cnt
         FROM post_comments
        GROUP BY post_id
     ) x ON x.post_id = p.id
     SET p.comment_count = COALESCE(x.cnt, 0)
     WHERE p.comment_count <> COALESCE(x.cnt, 0)`,
  );
  return result.affectedRows ?? 0;
}
