import { requireAdmin } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { pendingArticlePatchBodySchema } from "~/server/schemas";
import { updateArticleForAdmin } from "~/server/services/articleService";

/**
 * PATCH /api/admin/articles/pending/:id
 * Edit rewritten fields / category before approval.
 */
export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    const body = await parseBody(event, pendingArticlePatchBodySchema);
    const article = await updateArticleForAdmin(id, body);
    return { article };
  } catch (err) {
    mapDomainError(err);
  }
});
