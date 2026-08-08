/**
 * Pending-article job probes + publish claim helper.
 */
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { ArticleStatus, type PendingArticle } from "~/types/article";
import { isoToDB } from "../core/datetime";
import { nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { getPendingArticleById } from "./pendingArticlesCrud";

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

/** True when a rewrite job for this article is already pending/processing. */
export async function hasActiveRewriteJob(articleId: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM jobs
     WHERE type = 'articles.rewrite'
       AND status IN (0, 1)
       AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.articleId')) = ?
     LIMIT 1`,
    [articleId],
  );
  return rows.length > 0;
}

/**
 * Conditionally mark approved after a post was created.
 * Returns false if another admin already approved/rejected (race).
 */
export async function markArticleApprovedIfClaimable(args: {
  id: string;
  publishedPostId: string;
  rewrittenTitle: string;
  rewrittenContent: string;
}): Promise<PendingArticle | null> {
  const pool = getPool();
  const now = nowISO();
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE pending_articles
     SET status = ?,
         published_post_id = ?,
         published_at = ?,
         rewritten_title = ?,
         rewritten_content = ?,
         updated_at = ?
     WHERE id = ? AND status IN (?, ?)`,
    [
      ArticleStatus.Approved,
      args.publishedPostId,
      isoToDB(now),
      args.rewrittenTitle.slice(0, 512),
      args.rewrittenContent,
      isoToDB(now),
      args.id,
      ArticleStatus.Draft,
      ArticleStatus.PendingApproval,
    ],
  );
  if ((result.affectedRows ?? 0) === 0) return null;
  return getPendingArticleById(args.id);
}
