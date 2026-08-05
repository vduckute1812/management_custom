import { acceptFriendship } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    const friendship = await acceptFriendship(user.sub, id);
    return { friendship };
  } catch (err) {
    mapDomainError(err);
  }
});
