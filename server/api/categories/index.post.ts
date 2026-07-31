import { createPostCategory } from "~/server/utils/db";
import { requireAdmin } from "~/server/utils/authContext";
import { invalidateCategoryCaches } from "~/server/utils/cacheInvalidate";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { categoryCreateBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  try {
    const data = await parseBody(event, categoryCreateBodySchema);
    const category = await createPostCategory(data);
    await invalidateCategoryCaches();
    return { category };
  } catch (err) {
    mapDomainError(err);
  }
});
