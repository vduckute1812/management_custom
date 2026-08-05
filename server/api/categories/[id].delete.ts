import { deletePostCategory } from "~/server/utils/db";
import { requireAdmin } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";
import { invalidateCategoryCaches } from "~/server/utils/cacheInvalidate";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Category id required");
    }

    const removed = await deletePostCategory(id);
    if (!removed) {
      throw new DomainError(404, "Category not found");
    }
    await invalidateCategoryCaches();
    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
