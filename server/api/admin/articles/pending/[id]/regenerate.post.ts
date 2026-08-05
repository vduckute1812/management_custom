import { requireAdmin } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { regenerateArticle } from "~/server/services/articleService";

/**
 * POST /api/admin/articles/pending/:id/regenerate
 * Re-queue AI rewrite for this article.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    const article = await regenerateArticle(id);
    return { ok: true, article };
  } catch (err) {
    mapDomainError(err);
  }
});
