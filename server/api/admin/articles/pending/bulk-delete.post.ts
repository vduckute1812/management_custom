import { requireAdmin } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { pendingArticleBulkDeleteBodySchema } from "~/server/schemas";
import { deleteArticles } from "~/server/services/articleService";

/**
 * POST /api/admin/articles/pending/bulk-delete
 * Hard-delete pipeline rows (any status). Approved rows also remove the
 * published feed post when `published_post_id` is set.
 */
export default defineEventHandler(async (event) => {
  requireAdmin(event);
  try {
    const body = await parseBody(event, pendingArticleBulkDeleteBodySchema);
    const result = await deleteArticles(body.ids);
    return { ok: true, ...result };
  } catch (err) {
    mapDomainError(err);
  }
});
