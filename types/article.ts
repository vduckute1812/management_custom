/**
 * Automated article pipeline — pending articles awaiting admin review.
 * Status is TINYINT UNSIGNED end-to-end (MySQL → API → UI).
 */

/** Pipeline review status — Draft=0, PendingApproval=1, Approved=2, Rejected=3 */
export const ArticleStatus = {
  Draft: 0,
  PendingApproval: 1,
  Approved: 2,
  Rejected: 3,
} as const;
export type ArticleStatus = (typeof ArticleStatus)[keyof typeof ArticleStatus];

export const ARTICLE_STATUSES = [
  ArticleStatus.Draft,
  ArticleStatus.PendingApproval,
  ArticleStatus.Approved,
  ArticleStatus.Rejected,
] as const;

export const ARTICLE_STATUS_I18N_KEYS: Record<ArticleStatus, string> = {
  [ArticleStatus.Draft]: "adminArticles.statusDraft",
  [ArticleStatus.PendingApproval]: "adminArticles.statusPending",
  [ArticleStatus.Approved]: "adminArticles.statusApproved",
  [ArticleStatus.Rejected]: "adminArticles.statusRejected",
};

/**
 * Seeded category slugs the daily fetcher targets (7 core directories).
 * Matches `post_categories` seeds from migrations 0005 / 0006.
 */
export const PIPELINE_CATEGORY_SLUGS = [
  "electronics",
  "mechanical-engineering",
  "information-technology",
  "iot",
  "math",
  "docs",
  "ideas",
] as const;

export type PipelineCategorySlug = (typeof PIPELINE_CATEGORY_SLUGS)[number];

export function isArticleStatus(value: unknown): value is ArticleStatus {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (ARTICLE_STATUSES as readonly number[]).includes(value)
  );
}

export function toArticleStatus(value: unknown): ArticleStatus {
  const n = typeof value === "string" ? Number(value) : value;
  return isArticleStatus(n) ? n : ArticleStatus.Draft;
}

export interface PendingArticle {
  id: string;
  originalTitle: string;
  originalUrl: string;
  sourceName: string;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  rawContent: string;
  rewrittenTitle: string | null;
  rewrittenContent: string | null;
  excerpt: string | null;
  status: ArticleStatus;
  publishedPostId: string | null;
  sourcePublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface PendingArticleListItem {
  id: string;
  originalTitle: string;
  rewrittenTitle: string | null;
  sourceName: string;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  status: ArticleStatus;
  createdAt: string;
  sourcePublishedAt: string | null;
}
