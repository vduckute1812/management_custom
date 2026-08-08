/**
 * Shared row shape + mappers for pending articles.
 */
import type { RowDataPacket } from "mysql2/promise";
import {
  toArticleStatus,
  type ArticleStatus as ArticleStatusValue,
  type PendingArticle,
  type PendingArticleListItem,
} from "~/types/article";
import { normalizeArticleUrl, isSafeHttpUrl } from "~/utils/articleUrl";
import { dbToISO } from "../core/datetime";

export type { ArticleStatusValue as ArticleStatus };
export { normalizeArticleUrl, isSafeHttpUrl };

export interface PendingArticleRow extends RowDataPacket {
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

export function mapArticle(row: PendingArticleRow): PendingArticle {
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

export function mapListItem(row: PendingArticleRow): PendingArticleListItem {
  return {
    id: row.id,
    originalTitle: row.original_title,
    rewrittenTitle: row.rewritten_title,
    excerpt: row.excerpt,
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

export const SELECT_FULL = `
  a.id, a.original_title, a.original_url, a.source_name, a.category_id,
  c.slug AS category_slug, c.name AS category_name,
  a.raw_content, a.rewritten_title, a.rewritten_content, a.excerpt,
  a.status, a.published_post_id, a.source_published_at,
  a.created_at, a.updated_at, a.published_at
`;

/** List endpoints must not pull full MEDIUMTEXT bodies; preview via excerpt/LEFT. */
export const SELECT_LIST = `
  a.id, a.original_title, a.original_url, a.source_name, a.category_id,
  c.slug AS category_slug, c.name AS category_name,
  a.rewritten_title,
  COALESCE(NULLIF(TRIM(a.excerpt), ''), LEFT(a.raw_content, 280)) AS excerpt,
  a.status, a.source_published_at, a.created_at
`;
