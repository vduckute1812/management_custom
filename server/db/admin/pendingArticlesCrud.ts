/**
 * Pending article CRUD: create / read / update / delete / list.
 */
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import {
  ArticleStatus,
  type ArticleStatus as ArticleStatusValue,
  type PendingArticle,
  type PendingArticleListItem,
} from "~/types/article";
import { DomainError } from "~/server/utils/http";
import { hashArticleUrl } from "~/server/utils/articleUrlHash";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import {
  SELECT_FULL,
  SELECT_LIST,
  mapArticle,
  mapListItem,
  normalizeArticleUrl,
  isSafeHttpUrl,
  type PendingArticleRow,
} from "./pendingArticlesShared";

export async function urlHashExists(urlHash: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 AS ok FROM pending_articles WHERE url_hash = ? LIMIT 1",
    [urlHash],
  );
  return rows.length > 0;
}

export async function createPendingArticle(args: {
  originalTitle: string;
  originalUrl: string;
  sourceName: string;
  categoryId: string | null;
  rawContent: string;
  sourcePublishedAt?: string | null;
  status?: ArticleStatusValue;
}): Promise<PendingArticle | null> {
  const pool = getPool();
  const id = generateId("art");
  const now = nowISO();
  const url = normalizeArticleUrl(args.originalUrl);
  if (!isSafeHttpUrl(url)) {
    throw new DomainError(400, "Article URL must be http(s)");
  }
  const urlHash = hashArticleUrl(url);
  const title = args.originalTitle.trim().slice(0, 512);
  const raw = args.rawContent.trim();
  if (!title || !url || !raw) {
    throw new DomainError(400, "Article title, URL, and content are required");
  }
  const seedExcerpt = raw.replace(/\s+/g, " ").slice(0, 280);

  try {
    await pool.query(
      `INSERT INTO pending_articles
         (id, original_title, original_url, url_hash, source_name, category_id,
          raw_content, excerpt, status, source_published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        url,
        urlHash,
        args.sourceName.trim().slice(0, 255) || "Unknown",
        args.categoryId,
        raw,
        seedExcerpt,
        args.status ?? ArticleStatus.Draft,
        args.sourcePublishedAt ? isoToDB(args.sourcePublishedAt) : null,
        isoToDB(now),
        isoToDB(now),
      ],
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return null;
    }
    throw err;
  }

  const created = await getPendingArticleById(id);
  if (!created) throw new DomainError(500, "Failed to load created article");
  return created;
}

export async function getPendingArticleById(
  id: string,
): Promise<PendingArticle | null> {
  const pool = getPool();
  const [rows] = await pool.query<PendingArticleRow[]>(
    `SELECT ${SELECT_FULL}
     FROM pending_articles a
     LEFT JOIN post_categories c ON c.id = a.category_id
     WHERE a.id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] ? mapArticle(rows[0]) : null;
}

export async function listPendingArticles(args: {
  status?: ArticleStatusValue | null;
  categoryId?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ articles: PendingArticleListItem[]; total: number }> {
  const pool = getPool();
  const where: string[] = [];
  const params: unknown[] = [];

  if (args.status != null) {
    where.push("a.status = ?");
    params.push(args.status);
  }
  if (args.categoryId) {
    where.push("a.category_id = ?");
    params.push(args.categoryId);
  }
  if (args.createdFrom) {
    where.push("a.created_at >= ?");
    params.push(isoToDB(args.createdFrom));
  }
  if (args.createdTo) {
    // Inclusive end-of-day when date-only YYYY-MM-DD is passed.
    const to = args.createdTo.includes("T")
      ? args.createdTo
      : `${args.createdTo}T23:59:59.999Z`;
    where.push("a.created_at <= ?");
    params.push(isoToDB(to));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
  const offset = Math.max(args.offset ?? 0, 0);

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM pending_articles a ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.query<PendingArticleRow[]>(
    `SELECT ${SELECT_LIST}
     FROM pending_articles a
     LEFT JOIN post_categories c ON c.id = a.category_id
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return { articles: rows.map(mapListItem), total };
}

export async function updatePendingArticle(
  id: string,
  args: {
    rewrittenTitle?: string | null;
    rewrittenContent?: string | null;
    excerpt?: string | null;
    categoryId?: string | null;
    status?: ArticleStatusValue;
    publishedPostId?: string | null;
    publishedAt?: string | null;
  },
): Promise<PendingArticle> {
  const pool = getPool();
  const existing = await getPendingArticleById(id);
  if (!existing) throw new DomainError(404, "Article not found");

  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [isoToDB(nowISO())];

  if (args.rewrittenTitle !== undefined) {
    sets.push("rewritten_title = ?");
    params.push(
      args.rewrittenTitle == null
        ? null
        : args.rewrittenTitle.trim().slice(0, 512),
    );
  }
  if (args.rewrittenContent !== undefined) {
    sets.push("rewritten_content = ?");
    params.push(args.rewrittenContent);
  }
  if (args.excerpt !== undefined) {
    sets.push("excerpt = ?");
    params.push(args.excerpt);
  }
  if (args.categoryId !== undefined) {
    sets.push("category_id = ?");
    params.push(args.categoryId);
  }
  if (args.status !== undefined) {
    sets.push("status = ?");
    params.push(args.status);
  }
  if (args.publishedPostId !== undefined) {
    sets.push("published_post_id = ?");
    params.push(args.publishedPostId);
  }
  if (args.publishedAt !== undefined) {
    sets.push("published_at = ?");
    params.push(args.publishedAt ? isoToDB(args.publishedAt) : null);
  }

  params.push(id);
  await pool.query(
    `UPDATE pending_articles SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );

  const updated = await getPendingArticleById(id);
  if (!updated) throw new DomainError(404, "Article not found");
  return updated;
}

export async function deletePendingArticle(id: string): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query<ResultSetHeader>(
    "DELETE FROM pending_articles WHERE id = ?",
    [id],
  );
  return (result.affectedRows ?? 0) > 0;
}
