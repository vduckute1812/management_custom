/**
 * Approve a pending article and publish it as a public manuscript post.
 */

import {
  getPendingArticleById,
  updatePendingArticle,
  markArticleApprovedIfClaimable,
} from "~/server/db/admin/pendingArticles";
import { getCategoryById } from "~/server/db/feed/categories";
import { createPost } from "~/server/db/feed/posts";
import { invalidateFeedCachesAfterPostMutation } from "~/server/utils/cacheInvalidate";
import { DomainError } from "~/server/utils/http";
import { ArticleStatus, type PendingArticle } from "~/types/article";
import { PostFormat, PostVisibility } from "~/types/post";
import { ensureSourceAttribution } from "~/utils/articleAttribution";

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

  const manuscriptBody = ensureSourceAttribution(
    body,
    article.sourceName,
    article.originalUrl,
  );

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
    rewrittenContent: manuscriptBody,
  });
  if (!updated) {
    throw new DomainError(409, "Article already approved");
  }

  // createPost bypasses postService — bust public + auth feed / upload ACL.
  await invalidateFeedCachesAfterPostMutation({
    actorId: adminUserId,
    visibility: post.visibility,
    audienceUserIds: post.audienceUserIds,
  });

  return { article: updated, postId: post.id };
}
