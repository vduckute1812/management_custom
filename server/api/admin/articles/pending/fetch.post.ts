import { requireAdmin } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { pendingArticleFetchBodySchema } from "~/server/schemas";
import { enqueueArticleFetch } from "~/server/services/articleService";

/**
 * POST /api/admin/articles/pending/fetch
 * Manually enqueue a content-fetch job.
 */
export default defineEventHandler(async (event) => {
  requireAdmin(event);
  try {
    const raw = await readBody(event).catch(() => undefined);
    const parsed = pendingArticleFetchBodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: parsed.error.issues[0]?.message || "Invalid body",
      });
    }
    const result = await enqueueArticleFetch({ force: parsed.data.force });
    return { ok: true, ...result };
  } catch (err) {
    mapDomainError(err);
  }
});
