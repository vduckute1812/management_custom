import { requireAdmin, requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { pendingArticleApproveBodySchema } from "~/server/schemas";
import { approveAndPublishArticle } from "~/server/services/admin/articleService";

/**
 * POST /api/admin/articles/pending/:id/approve
 * Approve & publish as a public manuscript in the feed.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    const body = await parseBody(event, pendingArticleApproveBodySchema);
    const result = await approveAndPublishArticle(user.sub, id, body);
    return {
      ok: true,
      article: result.article,
      postId: result.postId,
    };
  } catch (err) {
    mapDomainError(err);
  }
});
