import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "../../core/datetime";
import { listAcceptedFriendIds } from "../../friends/friendships";
import { getPool } from "../../core/pool";
import type { Post } from "~/types/post";
import { isContentLocale } from "~/utils/contentLocale";
import {
  visibilityClause,
  visibilityClauseParams,
  publicOnlyClause,
} from "./acl";
import { encodeFeedCursor, parseFeedCursor } from "./cursors";
import { hydratePosts, shouldFetchMoreLocaleRows } from "./hydration";
import { buildPostSelect } from "./select";
import type { PostRow } from "./types";

async function viewerFriendIds(viewerId: string): Promise<string[]> {
  return listAcceptedFriendIds(viewerId);
}

function aclFor(
  viewerId: string,
  friendIds: readonly string[],
  alias: string,
): { sql: string; params: string[] } {
  return {
    sql: visibilityClause(alias, friendIds),
    params: visibilityClauseParams(viewerId, friendIds),
  };
}

/** Cheap ACL check — does not hydrate attachments/reactions/audience. */
export async function assertPostVisible(
  viewerId: string,
  postId: string,
): Promise<void> {
  const pool = getPool();
  const friendIds = await viewerFriendIds(viewerId);
  const acl = aclFor(viewerId, friendIds, "p");
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

  const friendIds = viewerId ? await viewerFriendIds(viewerId) : [];
  const sharedAcl = viewerId
    ? aclFor(viewerId, friendIds, "sp")
    : { sql: publicOnlyClause("sp"), params: [] as string[] };

  const params: unknown[] = [...sharedAcl.params];
  let where: string;
  if (viewerId) {
    const acl = aclFor(viewerId, friendIds, "p");
    where = `WHERE ${acl.sql}`;
    params.push(...acl.params);
  } else {
    where = `WHERE ${publicOnlyClause("p")}`;
  }
  if (categoryId) {
    where += " AND p.category_id = ?";
    params.push(categoryId);
  }
  let queryCursorAt: string | null = null;
  let queryCursorId: string | null = null;
  if (cursor) {
    const parsed = parseFeedCursor(cursor);
    queryCursorAt = isoToDB(parsed.createdAt);
    queryCursorId = parsed.id;
  }
  // Over-fetch when a preferred locale may collapse translation siblings
  // into fewer feed cards; otherwise only need limit+1 for nextCursor. If a
  // locale-heavy batch still has too few card candidates, continue from its
  // final raw row until hydration can produce a complete page or rows end.
  const fetchLimit = preferredLocale ? limit * 2 + 1 : limit + 1;
  const rows: PostRow[] = [];
  while (true) {
    let pageWhere = where;
    const pageParams = [...params];
    if (queryCursorAt) {
      if (queryCursorId) {
        pageWhere +=
          " AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))";
        pageParams.push(queryCursorAt, queryCursorAt, queryCursorId);
      } else {
        pageWhere += " AND p.created_at < ?";
        pageParams.push(queryCursorAt);
      }
    }
    pageParams.push(fetchLimit);

    const [batch] = await pool.query<PostRow[]>(
      `${buildPostSelect(sharedAcl.sql)}
       ${pageWhere}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`,
      pageParams,
    );
    rows.push(...batch);

    if (
      !preferredLocale ||
      !shouldFetchMoreLocaleRows(rows, limit + 1, batch.length === fetchLimit)
    ) {
      break;
    }
    const lastRow = batch[batch.length - 1];
    if (!lastRow) break;
    queryCursorAt = lastRow.created_at;
    queryCursorId = lastRow.id;
  }

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
  const friendIds = viewerId ? await viewerFriendIds(viewerId) : [];
  const sharedAcl = viewerId
    ? aclFor(viewerId, friendIds, "sp")
    : { sql: publicOnlyClause("sp"), params: [] as string[] };
  const params: unknown[] = [...sharedAcl.params, postId];
  let aclSql: string;
  if (viewerId) {
    const built = aclFor(viewerId, friendIds, "p");
    aclSql = built.sql;
    params.push(...built.params);
  } else {
    aclSql = publicOnlyClause("p");
  }

  const [rows] = await pool.query<PostRow[]>(
    `${buildPostSelect(sharedAcl.sql)}
     WHERE p.id = ? AND ${aclSql}
     LIMIT 1`,
    params,
  );
  if (!rows.length) return null;
  const [post] = await hydratePosts(rows, vid, null);
  return post ?? null;
}
