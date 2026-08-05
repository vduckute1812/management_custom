import { requireAdmin } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { pendingArticleRejectBodySchema } from "~/server/schemas";
import { rejectArticle } from "~/server/services/articleService";

/**
 * POST /api/admin/articles/pending/:id/reject
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    const body = await parseBody(event, pendingArticleRejectBodySchema);
    const result = await rejectArticle(id, { deleteRow: body.delete });
    return { ok: true, ...result };
  } catch (err) {
    mapDomainError(err);
  }
});
