import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import {
  ArticleStatus,
  toArticleStatus,
  type ArticleStatus as ArticleStatusValue,
  type PendingArticle,
  type PendingArticleListItem,
} from "../../types/article";
import { DomainError } from "~/server/utils/http";
import { hashArticleUrl, normalizeArticleUrl } from "~/utils/articleUrl";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";

export type { ArticleStatusValue as ArticleStatus };
export { hashArticleUrl, normalizeArticleUrl };

interface PendingArticleRow extends RowDataPacket {
  id: string;
  original_title: string;
  original_url: string;
  source_name: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  raw_content: string;
  rewritten_title: string | null;
  rewritten_content: string | null;
  excerpt: string | null;
  status: number;
  published_post_id: string | null;
  source_published_at: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

function mapArticle(row: PendingArticleRow): PendingArticle {
  return {
    id: row.id,
    originalTitle: row.original_title,
    originalUrl: row.original_url,
    sourceName: row.source_name,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    rawContent: row.raw_content,
    rewrittenTitle: row.rewritten_title,
    rewrittenContent: row.rewritten_content,
    excerpt: row.excerpt,
    status: toArticleStatus(Number(row.status)),
    publishedPostId: row.published_post_id,
    sourcePublishedAt: row.source_published_at
      ? dbToISO(row.source_published_at)
      : null,
    createdAt: dbToISO(row.created_at),
    updatedAt: dbToISO(row.updated_at),
    publishedAt: row.published_at ? dbToISO(row.published_at) : null,
  };
}

function mapListItem(row: PendingArticleRow): PendingArticleListItem {
  return {
    id: row.id,
    originalTitle: row.original_title,
    rewrittenTitle: row.rewritten_title,
    sourceName: row.source_name,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    status: toArticleStatus(Number(row.status)),
    createdAt: dbToISO(row.created_at),
    sourcePublishedAt: row.source_published_at
      ? dbToISO(row.source_published_at)
      : null,
  };
}

const SELECT_FULL = `
  a.id, a.original_title, a.original_url, a.source_name, a.category_id,
  c.slug AS category_slug, c.name AS category_name,
  a.raw_content, a.rewritten_title, a.rewritten_content, a.excerpt,
  a.status, a.published_post_id, a.source_published_at,
  a.created_at, a.updated_at, a.published_at
`;

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
  const urlHash = hashArticleUrl(url);
  const title = args.originalTitle.trim().slice(0, 512);
  const raw = args.rawContent.trim();
  if (!title || !url || !raw) {
    throw new DomainError(400, "Article title, URL, and content are required");
  }

  try {
    await pool.query(
      `INSERT INTO pending_articles
         (id, original_title, original_url, url_hash, source_name, category_id,
          raw_content, status, source_published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        url,
        urlHash,
        args.sourceName.trim().slice(0, 255) || "Unknown",
        args.categoryId,
        raw,
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
    `SELECT ${SELECT_FULL}
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

/** True when a completed fetch job ran on the given UTC calendar day. */
export async function hasCompletedFetchOnUtcDay(
  dayYmd: string,
): Promise<boolean> {
  const pool = getPool();
  const start = `${dayYmd}T00:00:00.000Z`;
  const end = `${dayYmd}T23:59:59.999Z`;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM jobs
     WHERE type = 'articles.fetch'
       AND status = 2
       AND created_at >= ?
       AND created_at <= ?
     LIMIT 1`,
    [isoToDB(start), isoToDB(end)],
  );
  return rows.length > 0;
}

/** True when a pending/processing fetch job already exists. */
export async function hasActiveFetchJob(): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM jobs
     WHERE type = 'articles.fetch'
       AND status IN (0, 1)
     LIMIT 1`,
  );
  return rows.length > 0;
}
