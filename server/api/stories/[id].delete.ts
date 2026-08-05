import { deleteStory } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  try {
    const user = requireUser(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Story id required");
    }
    const ok = await deleteStory(user.sub, id);
    if (!ok) {
      throw new DomainError(404, "Story not found");
    }
    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
