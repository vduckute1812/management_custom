import { deleteEpic } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  try {
    const user = requireUser(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Missing epic id");
    }

    const result = await deleteEpic(user.sub, id);
    if (!result) {
      throw new DomainError(404, "Epic not found");
    }

    return {
      ok: true,
      removed: result.removed,
      orphanedTasks: result.orphanedTasks,
    };
  } catch (err) {
    mapDomainError(err);
  }
});
