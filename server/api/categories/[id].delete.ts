import { deletePostCategory } from "~/server/utils/db";
import { requireAdmin } from "~/server/utils/authContext";
import { invalidateCategoryCaches } from "~/server/utils/cacheInvalidate";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Category id required",
    });
  }

  const removed = await deletePostCategory(id);
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: "Category not found" });
  }
  await invalidateCategoryCaches();
  return { ok: true };
});
