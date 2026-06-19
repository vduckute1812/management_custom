import { deleteTask } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing task id" });
  }

  const removed = await deleteTask(user.sub, id);
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: "Task not found" });
  }

  return { ok: true, removed };
});
