import { deleteStory } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Story id required" });
  }
  const ok = await deleteStory(user.sub, id);
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: "Story not found" });
  }
  return { ok: true };
});
