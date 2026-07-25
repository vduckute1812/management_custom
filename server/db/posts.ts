import type { RowDataPacket } from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import type {
  Post,
  PostAuthor,
  PostComment,
  SharedPostPreview,
} from "../../types/post";

interface PostRow extends RowDataPacket {
  id: string;
  user_id: string;
  body: string;
  shared_post_id: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_email: string;
  like_count: number;
  comment_count: number;
  liked_by_me: number;
  shared_body: string | null;
  shared_created_at: string | null;
  shared_author_id: string | null;
  shared_author_name: string | null;
  shared_author_email: string | null;
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

function toAuthor(
  id: string,
  name: string | null,
  email: string
): PostAuthor {
  return { id, name, email };
}

function rowToPost(row: PostRow, viewerId: string): Post {
  let sharedPost: SharedPostPreview | null = null;
  if (
    row.shared_post_id &&
    row.shared_body != null &&
    row.shared_author_id &&
    row.shared_author_email
  ) {
    sharedPost = {
      id: row.shared_post_id,
      body: row.shared_body,
      createdAt: dbToISO(row.shared_created_at),
      author: toAuthor(
        row.shared_author_id,
        row.shared_author_name,
        row.shared_author_email
      ),
    };
  }

  return {
    id: row.id,
    body: row.body,
    createdAt: dbToISO(row.created_at),
    updatedAt: dbToISO(row.updated_at),
    author: toAuthor(row.user_id, row.author_name, row.author_email),
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    likedByMe: Number(row.liked_by_me ?? 0) > 0,
    sharedPost,
    canDelete: row.user_id === viewerId,
  };
}

function rowToComment(row: CommentRow, viewerId: string): PostComment {
  return {
    id: row.id,
    postId: row.post_id,
    body: row.body,
    createdAt: dbToISO(row.created_at),
    updatedAt: dbToISO(row.updated_at),
    author: toAuthor(row.user_id, row.author_name, row.author_email),
    canDelete: row.user_id === viewerId,
  };
}

const POST_SELECT = `
  SELECT
    p.id,
    p.user_id,
    p.body,
    p.shared_post_id,
    p.created_at,
    p.updated_at,
    u.name AS author_name,
    u.email AS author_email,
    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
    (SELECT COUNT(*) FROM post_likes pl2
      WHERE pl2.post_id = p.id AND pl2.user_id = ?) AS liked_by_me,
    sp.body AS shared_body,
    sp.created_at AS shared_created_at,
    su.id AS shared_author_id,
    su.name AS shared_author_name,
    su.email AS shared_author_email
  FROM posts p
  INNER JOIN users u ON u.id = p.user_id
  LEFT JOIN posts sp ON sp.id = p.shared_post_id
  LEFT JOIN users su ON su.id = sp.user_id
`;

export async function listFeedPosts(
  viewerId: string,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<{ posts: Post[]; nextCursor: string | null }> {
  const pool = getPool();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const cursor = options.cursor?.trim() || null;

  const params: unknown[] = [viewerId];
  let where = "";
  if (cursor) {
    where = "WHERE p.created_at < ?";
    params.push(isoToDB(cursor));
  }
  params.push(limit + 1);

  const [rows] = await pool.query<PostRow[]>(
    `${POST_SELECT}
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ?`,
    params
  );

  const page = rows.slice(0, limit).map((r) => rowToPost(r, viewerId));
  const nextCursor =
    rows.length > limit ? page[page.length - 1]?.createdAt ?? null : null;
  return { posts: page, nextCursor };
}

export async function getPostById(
  viewerId: string,
  postId: string
): Promise<Post | null> {
  const pool = getPool();
  const [rows] = await pool.query<PostRow[]>(
    `${POST_SELECT}
     WHERE p.id = ?
     LIMIT 1`,
    [viewerId, postId]
  );
  return rows.length ? rowToPost(rows[0], viewerId) : null;
}

export async function createPost(
  userId: string,
  body: string,
  sharedPostId?: string | null
): Promise<Post> {
  const pool = getPool();
  const id = generateId("post");
  const now = nowISO();
  const trimmed = body.trim();

  if (sharedPostId) {
    const existing = await getPostById(userId, sharedPostId);
    if (!existing) {
      throw Object.assign(new Error("Shared post not found"), {
        statusCode: 404,
      });
    }
  }

  await pool.query(
    `INSERT INTO posts (id, user_id, body, shared_post_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      trimmed,
      sharedPostId ?? null,
      isoToDB(now),
      isoToDB(now),
    ]
  );

  const created = await getPostById(userId, id);
  if (!created) {
    throw new Error("Failed to load created post");
  }
  return created;
}

export async function deletePost(
  userId: string,
  postId: string
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query(
    "DELETE FROM posts WHERE id = ? AND user_id = ?",
    [postId, userId]
  );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function togglePostLike(
  userId: string,
  postId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const pool = getPool();
  const post = await getPostById(userId, postId);
  if (!post) {
    throw Object.assign(new Error("Post not found"), { statusCode: 404 });
  }

  if (post.likedByMe) {
    await pool.query(
      "DELETE FROM post_likes WHERE post_id = ? AND user_id = ?",
      [postId, userId]
    );
  } else {
    await pool.query(
      `INSERT INTO post_likes (post_id, user_id, created_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [postId, userId, isoToDB(nowISO())]
    );
  }

  const refreshed = await getPostById(userId, postId);
  return {
    liked: refreshed?.likedByMe ?? false,
    likeCount: refreshed?.likeCount ?? 0,
  };
}

export async function listPostComments(
  viewerId: string,
  postId: string
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
    [postId]
  );
  return rows.map((r) => rowToComment(r, viewerId));
}

export async function createPostComment(
  userId: string,
  postId: string,
  body: string
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
    [id, postId, userId, trimmed, isoToDB(now), isoToDB(now)]
  );

  const [rows] = await pool.query<CommentRow[]>(
    `SELECT
       c.id, c.post_id, c.user_id, c.body, c.created_at, c.updated_at,
       u.name AS author_name, u.email AS author_email
     FROM post_comments c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = ?
     LIMIT 1`,
    [id]
  );
  if (!rows.length) {
    throw new Error("Failed to load created comment");
  }
  return rowToComment(rows[0], userId);
}

export async function deletePostComment(
  userId: string,
  postId: string,
  commentId: string
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query(
    "DELETE FROM post_comments WHERE id = ? AND post_id = ? AND user_id = ?",
    [commentId, postId, userId]
  );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}
