import { deleteEpic } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing epic id" });
  }

  const result = await deleteEpic(user.sub, id);
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: "Epic not found" });
  }

  return {
    ok: true,
    removed: result.removed,
    orphanedTasks: result.orphanedTasks,
  };
});
