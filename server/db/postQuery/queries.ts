import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "../datetime";
import { listAcceptedFriendIds } from "../friendships";
import { getPool } from "../pool";
import type { Post } from "../../../types/post";
import { isContentLocale } from "../../../utils/contentLocale";
import {
  visibilityClause,
  visibilityClauseParams,
  publicOnlyClause,
} from "./acl";
import { encodeFeedCursor, parseFeedCursor } from "./cursors";
import { hydratePosts } from "./hydration";
import { POST_SELECT } from "./select";
import type { PostRow } from "./types";

async function viewerAcl(viewerId: string): Promise<{
  sql: string;
  params: string[];
}> {
  const friendIds = await listAcceptedFriendIds(viewerId);
  return {
    sql: visibilityClause("p", friendIds),
    params: visibilityClauseParams(viewerId, friendIds),
  };
}

/** Cheap ACL check — does not hydrate attachments/reactions/audience. */
export async function assertPostVisible(
  viewerId: string,
  postId: string,
): Promise<void> {
  const pool = getPool();
  const acl = await viewerAcl(viewerId);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM posts p
     WHERE p.id = ? AND ${acl.sql}
     LIMIT 1`,
    [postId, ...acl.params],
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

  const params: unknown[] = [];
  let where: string;
  if (viewerId) {
    const acl = await viewerAcl(viewerId);
    where = `WHERE ${acl.sql}`;
    params.push(...acl.params);
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
      where += " AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))";
      const at = isoToDB(parsed.createdAt);
      params.push(at, at, parsed.id);
    } else {
      where += " AND p.created_at < ?";
      params.push(isoToDB(parsed.createdAt));
    }
  }
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
  const params: unknown[] = [postId];
  let acl: string;
  if (viewerId) {
    const built = await viewerAcl(viewerId);
    acl = built.sql;
    params.push(...built.params);
  } else {
    acl = publicOnlyClause("p");
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
