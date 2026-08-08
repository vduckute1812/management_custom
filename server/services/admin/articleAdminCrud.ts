/**
 * Admin CRUD for pending articles (list / get / patch).
 */

import {
  getPendingArticleById,
  updatePendingArticle,
  listPendingArticles,
} from "~/server/db/admin/pendingArticles";
import { getCategoryById } from "~/server/db/feed/categories";
import { DomainError } from "~/server/utils/http";
import {
  ArticleStatus,
  type ArticleStatus as ArticleStatusValue,
  type PendingArticle,
} from "~/types/article";

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
