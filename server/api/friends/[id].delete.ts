import { deleteFriendship } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    await deleteFriendship(user.sub, id);
    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
