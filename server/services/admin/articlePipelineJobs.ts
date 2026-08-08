/**
 * Article pipeline jobs: enqueue, settings, fetch/rewrite workers.
 */

import {
  createPendingArticle,
  getPendingArticleById,
  updatePendingArticle,
  hasActiveFetchJob,
  hasActiveRewriteJob,
  hasCompletedFetchOnUtcDay,
} from "~/server/db/admin/pendingArticles";
import { getCategoryBySlug } from "~/server/db/feed/categories";
import { DomainError } from "~/server/utils/http";
import { enqueueJob } from "~/server/db/core/jobs";
import {
  ArticleStatus,
  PIPELINE_CATEGORY_SLUGS,
  type PendingArticle,
} from "~/types/article";
import { fetchArticlesFromSources } from "~/server/services/admin/articleFetcher";
import {
  llmConfigured,
  rewriteArticle,
} from "~/server/services/admin/articleRewriter";
import { JobTypes } from "~/server/utils/queue";
import { ensureSourceAttribution } from "~/utils/articleAttribution";
import {
  isArticlesDailyFetchEnabled,
  setArticlesDailyFetchEnabled,
} from "~/server/db/auth/appSettings";

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
  if (!(await isArticlesDailyFetchEnabled())) {
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

export async function getArticlePipelineSettings(): Promise<{
  dailyFetchEnabled: boolean;
}> {
  return {
    dailyFetchEnabled: await isArticlesDailyFetchEnabled(),
  };
}

export async function updateArticlePipelineSettings(input: {
  dailyFetchEnabled: boolean;
}): Promise<{ dailyFetchEnabled: boolean }> {
  const dailyFetchEnabled = await setArticlesDailyFetchEnabled(
    input.dailyFetchEnabled,
  );
  return { dailyFetchEnabled };
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

  const rewrittenContent = ensureSourceAttribution(
    result.rewrittenContent,
    article.sourceName,
    article.originalUrl,
  );

  return updatePendingArticle(articleId, {
    rewrittenTitle: result.rewrittenTitle,
    rewrittenContent,
    excerpt: result.excerpt,
    status: ArticleStatus.PendingApproval,
  });
}
