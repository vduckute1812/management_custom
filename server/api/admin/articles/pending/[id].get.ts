import { requireAdmin } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { getArticleForAdmin } from "~/server/services/admin/articleService";

/**
 * GET /api/admin/articles/pending/:id
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    const article = await getArticleForAdmin(id);
    return { article };
  } catch (err) {
    mapDomainError(err);
  }
});
