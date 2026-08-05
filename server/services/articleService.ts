/**
 * Orchestrates the automated article pipeline:
 * fetch → insert draft → AI rewrite → admin review → publish as manuscript.
 */

import {
  createPendingArticle,
  getPendingArticleById,
  updatePendingArticle,
  deletePendingArticle,
  listPendingArticles,
  hasActiveFetchJob,
  hasActiveRewriteJob,
  hasCompletedFetchOnUtcDay,
  markArticleApprovedIfClaimable,
} from "~/server/db/pendingArticles";
import { getCategoryById, getCategoryBySlug } from "~/server/db/categories";
import { createPost } from "~/server/db/posts";
import { DomainError } from "~/server/utils/http";
import { enqueueJob } from "~/server/db/jobs";
import {
  ArticleStatus,
  PIPELINE_CATEGORY_SLUGS,
  type ArticleStatus as ArticleStatusValue,
  type PendingArticle,
} from "~/types/article";
import { PostFormat, PostVisibility } from "~/types/post";
import { fetchArticlesFromSources } from "~/server/services/articleFetcher";
import {
  llmConfigured,
  rewriteArticle,
} from "~/server/services/articleRewriter";
import { JobTypes } from "~/server/utils/queue";
import { isSafeHttpUrl } from "~/utils/articleUrl";

export async function enqueueArticleRewrite(
  articleId: string,
  opts?: { delaySeconds?: number },
): Promise<{ enqueued: boolean }> {
  if (await hasActiveRewriteJob(articleId)) {
    return { enqueued: false };
  }
  await enqueueJob({
    type: JobTypes.ArticlesRewrite,
    payload: { articleId },
    delaySeconds: opts?.delaySeconds ?? 0,
    maxAttempts: 4,
  });
  return { enqueued: true };
}

export async function enqueueArticleFetch(opts?: {
  delaySeconds?: number;
  force?: boolean;
}): Promise<{ enqueued: boolean; reason?: string }> {
  // Never stack concurrent fetch jobs — force only skips the "already ran today" check.
  if (await hasActiveFetchJob()) {
    return { enqueued: false, reason: "active_fetch_exists" };
  }
  await enqueueJob({
    type: JobTypes.ArticlesFetch,
    payload: { force: Boolean(opts?.force) },
    delaySeconds: opts?.delaySeconds ?? 0,
    maxAttempts: 3,
  });
  return { enqueued: true };
}

/** Schedule daily fetch at ARTICLES_FETCH_HOUR_UTC if not already done today. */
export async function maybeScheduleDailyArticleFetch(): Promise<void> {
  if (
    ["0", "false", "no", "off"].includes(
      (process.env.ARTICLES_FETCH_ENABLED || "true").trim().toLowerCase(),
    )
  ) {
    return;
  }

  const hour = Number(process.env.ARTICLES_FETCH_HOUR_UTC ?? "2");
  const targetHour =
    Number.isFinite(hour) && hour >= 0 && hour <= 23 ? Math.floor(hour) : 2;

  const now = new Date();
  const utcHour = now.getUTCHours();
  if (utcHour < targetHour) return;

  const day = now.toISOString().slice(0, 10);
  if (await hasCompletedFetchOnUtcDay(day)) return;
  if (await hasActiveFetchJob()) return;

  await enqueueArticleFetch();
  console.info(`[articles] scheduled daily fetch for ${day} UTC`);
}

export async function runArticleFetchJob(): Promise<{
  fetched: number;
  inserted: number;
  skipped: number;
  rewriteQueued: number;
  errors: { source: string; message: string }[];
}> {
  const { items, errors } = await fetchArticlesFromSources();
  let inserted = 0;
  let skipped = 0;
  let rewriteQueued = 0;

  const categoryIdBySlug = new Map<string, string>();
  for (const slug of PIPELINE_CATEGORY_SLUGS) {
    const cat = await getCategoryBySlug(slug);
    if (cat) categoryIdBySlug.set(slug, cat.id);
  }

  for (const item of items) {
    const categoryId = categoryIdBySlug.get(item.categorySlug) ?? null;
    const article = await createPendingArticle({
      originalTitle: item.title,
      originalUrl: item.url,
      sourceName: item.sourceName,
      categoryId,
      rawContent: item.rawContent,
      sourcePublishedAt: item.publishedAt,
      status: ArticleStatus.Draft,
    });
    if (!article) {
      skipped += 1;
      continue;
    }
    inserted += 1;
    if (llmConfigured()) {
      const queued = await enqueueArticleRewrite(article.id, {
        delaySeconds: rewriteQueued * 2,
      });
      if (queued.enqueued) rewriteQueued += 1;
    } else {
      console.warn(
        "[articles] LLM not configured — leaving article as draft without rewrite",
      );
    }
  }

  return {
    fetched: items.length,
    inserted,
    skipped,
    rewriteQueued,
    errors,
  };
}

export async function runArticleRewriteJob(
  articleId: string,
): Promise<PendingArticle> {
  const article = await getPendingArticleById(articleId);
  if (!article) {
    throw new DomainError(404, "Article not found");
  }
  if (
    article.status === ArticleStatus.Approved ||
    article.status === ArticleStatus.Rejected
  ) {
    throw new DomainError(
      409,
      "Cannot rewrite an approved or rejected article",
    );
  }

  const categoryName =
    article.categoryName || article.categorySlug || "General";

  const result = await rewriteArticle({
    originalTitle: article.originalTitle,
    rawContent: article.rawContent,
    categoryName,
    sourceName: article.sourceName,
  });

  return updatePendingArticle(articleId, {
    rewrittenTitle: result.rewrittenTitle,
    rewrittenContent: result.rewrittenContent,
    excerpt: result.excerpt,
    status: ArticleStatus.PendingApproval,
  });
}

export async function listArticlesForAdmin(args: {
  status?: ArticleStatusValue | null;
  categoryId?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  limit?: number;
  offset?: number;
}) {
  return listPendingArticles(args);
}

export async function getArticleForAdmin(id: string): Promise<PendingArticle> {
  const article = await getPendingArticleById(id);
  if (!article) throw new DomainError(404, "Article not found");
  return article;
}

export async function updateArticleForAdmin(
  id: string,
  input: {
    rewrittenTitle?: string;
    rewrittenContent?: string;
    excerpt?: string | null;
    categoryId?: string | null;
  },
): Promise<PendingArticle> {
  const existing = await getPendingArticleById(id);
  if (!existing) throw new DomainError(404, "Article not found");
  if (existing.status === ArticleStatus.Approved) {
    throw new DomainError(409, "Approved articles cannot be edited here");
  }

  if (input.categoryId) {
    const cat = await getCategoryById(input.categoryId);
    if (!cat) throw new DomainError(400, "Invalid category");
  }

  return updatePendingArticle(id, {
    rewrittenTitle: input.rewrittenTitle,
    rewrittenContent: input.rewrittenContent,
    excerpt: input.excerpt,
    categoryId: input.categoryId,
  });
}

export async function approveAndPublishArticle(
  adminUserId: string,
  id: string,
  input?: {
    rewrittenTitle?: string;
    rewrittenContent?: string;
    categoryId?: string | null;
  },
): Promise<{ article: PendingArticle; postId: string }> {
  let article = await getPendingArticleById(id);
  if (!article) throw new DomainError(404, "Article not found");
  if (article.status === ArticleStatus.Approved) {
    throw new DomainError(409, "Article already approved");
  }
  if (article.status === ArticleStatus.Rejected) {
    throw new DomainError(409, "Rejected articles cannot be approved");
  }
  // Draft is OK when the admin (or a finished rewrite) already filled content.
  // Only block Draft when there is still nothing to publish.

  if (
    input?.rewrittenTitle != null ||
    input?.rewrittenContent != null ||
    input?.categoryId !== undefined
  ) {
    if (input.categoryId) {
      const cat = await getCategoryById(input.categoryId);
      if (!cat) throw new DomainError(400, "Invalid category");
    }
    article = await updatePendingArticle(id, {
      rewrittenTitle: input.rewrittenTitle ?? article.rewrittenTitle,
      rewrittenContent: input.rewrittenContent ?? article.rewrittenContent,
      categoryId:
        input.categoryId !== undefined ? input.categoryId : article.categoryId,
    });
  }

  // Prefer the editable rewrite; fall back to original so admins can publish
  // even when the LLM never ran (Draft with raw RSS/ArXiv body only).
  const title = (article.rewrittenTitle || article.originalTitle).trim();
  const body = (article.rewrittenContent || article.rawContent || "").trim();
  if (!title || !body) {
    throw new DomainError(
      400,
      "Title and content are required before publishing",
    );
  }

  const safeUrl = isSafeHttpUrl(article.originalUrl)
    ? article.originalUrl
    : null;
  const attribution = safeUrl
    ? `\n\n---\n*Adapted from [${article.sourceName}](${safeUrl})*`
    : `\n\n---\n*Adapted from ${article.sourceName}*`;
  const manuscriptBody =
    safeUrl && body.includes(safeUrl) ? body : `${body}${attribution}`;

  const post = await createPost(adminUserId, {
    title,
    body: manuscriptBody,
    format: PostFormat.Manuscript,
    visibility: PostVisibility.Public,
    categoryId: article.categoryId,
    contentLocale: "en",
  });

  const updated = await markArticleApprovedIfClaimable({
    id,
    publishedPostId: post.id,
    rewrittenTitle: title,
    rewrittenContent: body,
  });
  if (!updated) {
    throw new DomainError(409, "Article already approved");
  }

  return { article: updated, postId: post.id };
}

export async function rejectArticle(
  id: string,
  opts?: { deleteRow?: boolean },
): Promise<{ deleted: boolean; article: PendingArticle | null }> {
  const article = await getPendingArticleById(id);
  if (!article) throw new DomainError(404, "Article not found");
  if (article.status === ArticleStatus.Approved) {
    throw new DomainError(409, "Approved articles cannot be rejected");
  }
  if (opts?.deleteRow) {
    await deletePendingArticle(id);
    return { deleted: true, article: null };
  }
  const updated = await updatePendingArticle(id, {
    status: ArticleStatus.Rejected,
  });
  return { deleted: false, article: updated };
}

export async function regenerateArticle(id: string): Promise<PendingArticle> {
  const article = await getPendingArticleById(id);
  if (!article) throw new DomainError(404, "Article not found");
  if (article.status === ArticleStatus.Approved) {
    throw new DomainError(409, "Approved articles cannot be regenerated");
  }
  if (!llmConfigured()) {
    throw new DomainError(503, "LLM provider is not configured");
  }
  if (await hasActiveRewriteJob(id)) {
    // Already rewriting — surface current draft state without stacking jobs.
    if (article.status !== ArticleStatus.Draft) {
      return updatePendingArticle(id, { status: ArticleStatus.Draft });
    }
    return article;
  }
  await updatePendingArticle(id, { status: ArticleStatus.Draft });
  await enqueueArticleRewrite(id);
  const updated = await getPendingArticleById(id);
  if (!updated) throw new DomainError(404, "Article not found");
  return updated;
}
