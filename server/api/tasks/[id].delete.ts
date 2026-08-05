import { deleteTask } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  try {
    const user = requireUser(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Missing task id");
    }

    const removed = await deleteTask(user.sub, id);
    if (!removed) {
      throw new DomainError(404, "Task not found");
    }

    return { ok: true, removed };
  } catch (err) {
    mapDomainError(err);
  }
});
