import { requireAdmin } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { pendingArticleSettingsPatchBodySchema } from "~/server/schemas";
import { updateArticlePipelineSettings } from "~/server/services/articleService";

/**
 * PATCH /api/admin/articles/pending/settings
 * Toggle daily automatic article fetch (persisted in app_settings).
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  try {
    const body = await parseBody(event, pendingArticleSettingsPatchBodySchema);
    const settings = await updateArticlePipelineSettings({
      dailyFetchEnabled: body.dailyFetchEnabled,
    });
    return { ok: true, ...settings };
  } catch (err) {
    mapDomainError(err);
  }
});
