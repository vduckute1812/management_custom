import { requireAdmin } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { getArticlePipelineSettings } from "~/server/services/admin/articleService";

/**
 * GET /api/admin/articles/pending/settings
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  try {
    return await getArticlePipelineSettings();
  } catch (err) {
    mapDomainError(err);
  }
});
