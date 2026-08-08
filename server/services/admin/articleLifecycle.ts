/**
 * Article lifecycle: delete, bulk-delete, reject, regenerate.
 */

import {
  getPendingArticleById,
  updatePendingArticle,
  deletePendingArticle,
  hasActiveRewriteJob,
} from "~/server/db/admin/pendingArticles";
import { deletePostById } from "~/server/db/feed/posts";
import { DomainError } from "~/server/utils/http";
import { ArticleStatus, type PendingArticle } from "~/types/article";
import { llmConfigured } from "~/server/services/admin/articleRewriter";
import {
  invalidateAllAuthFeedCaches,
  invalidatePublicFeedCaches,
} from "~/server/utils/cacheInvalidate";
import { enqueueArticleRewrite } from "~/server/services/admin/articlePipelineJobs";

export async function deleteArticle(
  id: string,
): Promise<{ deleted: boolean; removedPostId: string | null }> {
  const article = await getPendingArticleById(id);
  if (!article) throw new DomainError(404, "Article not found");

  let removedPostId: string | null = null;
  if (article.publishedPostId) {
    const removed = await deletePostById(article.publishedPostId);
    if (removed) {
      removedPostId = article.publishedPostId;
    }
  }

  const deleted = await deletePendingArticle(id);
  if (!deleted) throw new DomainError(404, "Article not found");

  if (removedPostId) {
    await invalidatePublicFeedCaches();
    await invalidateAllAuthFeedCaches();
  }

  return { deleted: true, removedPostId };
}

const BULK_DELETE_MAX = 50;

export async function deleteArticles(
  ids: string[],
): Promise<{ deleted: number; removedPosts: number; missing: number }> {
  const unique = [
    ...new Set(
      ids
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= 64),
    ),
  ].slice(0, BULK_DELETE_MAX);

  let deleted = 0;
  let removedPosts = 0;
  let missing = 0;

  for (const id of unique) {
    try {
      const result = await deleteArticle(id);
      if (result.deleted) deleted += 1;
      if (result.removedPostId) removedPosts += 1;
    } catch (err) {
      if (err instanceof DomainError && err.statusCode === 404) {
        missing += 1;
        continue;
      }
      throw err;
    }
  }

  return { deleted, removedPosts, missing };
}

export async function rejectArticle(
  id: string,
  opts?: { deleteRow?: boolean },
): Promise<{ deleted: boolean; article: PendingArticle | null }> {
  const article = await getPendingArticleById(id);
  if (!article) throw new DomainError(404, "Article not found");

  // Hard-delete is allowed for every status, including Approved (also removes
  // the published feed post when present).
  if (opts?.deleteRow) {
    await deleteArticle(id);
    return { deleted: true, article: null };
  }

  if (article.status === ArticleStatus.Approved) {
    throw new DomainError(409, "Approved articles cannot be rejected");
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
