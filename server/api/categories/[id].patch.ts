import { updatePostCategory } from "~/server/utils/db";
import { requireAdmin } from "~/server/utils/authContext";
import { invalidateCategoryCaches } from "~/server/utils/cacheInvalidate";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { categoryPatchBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Category id required",
    });
  }

  try {
    const data = await parseBody(event, categoryPatchBodySchema);
    const category = await updatePostCategory(id, data);
    await invalidateCategoryCaches();
    return { category };
  } catch (err) {
    mapDomainError(err);
  }
});
