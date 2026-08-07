import { listFriendshipOverview } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseQuery } from "~/server/utils/http";
import { friendshipsQuerySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, friendshipsQuerySchema);
  try {
    return await listFriendshipOverview(user.sub, query);
  } catch (err) {
    mapDomainError(err);
  }
});
