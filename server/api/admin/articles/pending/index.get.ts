import { requireAdmin } from "~/server/utils/authContext";
import { parseQuery, mapDomainError } from "~/server/utils/http";
import { pendingArticlesQuerySchema } from "~/server/schemas";
import { listArticlesForAdmin } from "~/server/services/articleService";
import { ArticleStatus } from "~/types/article";

/**
 * GET /api/admin/articles/pending
 * List pipeline articles (default: pending_approval).
 */
export default defineEventHandler(async (event) => {
  requireAdmin(event);
  try {
    const query = parseQuery(event, pendingArticlesQuerySchema);
    const status =
      query.status !== undefined ? query.status : ArticleStatus.PendingApproval;
    const result = await listArticlesForAdmin({
      status,
      categoryId: query.categoryId ?? null,
      createdFrom: query.createdFrom
        ? `${query.createdFrom}T00:00:00.000Z`
        : null,
      createdTo: query.createdTo ?? null,
      limit: query.limit,
      offset: query.offset,
    });
    return result;
  } catch (err) {
    mapDomainError(err);
  }
});
